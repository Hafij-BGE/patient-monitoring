package edu.deu.pmsim

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.UUID

/**
 * Bluetooth LE Heart Rate Service (0x180D) client for the JS bridge.
 * Scans only for HRS advertisers, connects, enables Heart Rate Measurement (0x2A37)
 * notifications and forwards the raw bytes as hex; parsing happens in the web app
 * (src/devices/gatt.js). All public methods are called on the UI thread.
 */
@SuppressLint("MissingPermission") // every entry point checks hasPermissions() first
class BleHeartRate(private val act: MainActivity) {

    companion object {
        private const val TAG = "PMSIM-BLE"
        const val SCAN_MS = 15_000L
        private fun uuid16(v: Int): UUID = UUID.fromString(String.format("%08x-0000-1000-8000-00805f9b34fb", v))
        val HRS: UUID = uuid16(0x180D)
        val HRM: UUID = uuid16(0x2A37)
        val BSL: UUID = uuid16(0x2A38)
        val CCCD: UUID = uuid16(0x2902)
    }

    private val main = Handler(Looper.getMainLooper())
    private val adapter: BluetoothAdapter? =
        (act.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    private var scanning = false
    private val seen = LinkedHashMap<String, String?>() // address -> name
    @Volatile private var gatt: BluetoothGatt? = null
    @Volatile private var deviceLabel: String = ""
    private var pendingAfterPermission: (() -> Unit)? = null

    private val stopRunnable = Runnable { stopScan(report = true) }

    private fun requiredPermissions(): Array<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }

    private fun hasPermissions(): Boolean = requiredPermissions().all {
        ContextCompat.checkSelfPermission(act, it) == PackageManager.PERMISSION_GRANTED
    }

    private fun supported(): Boolean =
        adapter != null && act.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)

    /** "available" | "off" | "unsupported" | "no-permission" */
    fun status(): String = when {
        !supported() -> "unsupported"
        adapter?.isEnabled != true -> "off"
        !hasPermissions() -> "no-permission"
        else -> "available"
    }

    private fun state(state: String, detail: String? = null) {
        val o = JSONObject().put("type", "ble-state").put("state", state)
        if (detail != null) o.put("detail", detail)
        act.emit(o)
    }

    /** Runs [action] once runtime permissions are granted; emits no-permission otherwise. */
    private fun withPermissions(action: () -> Unit) {
        if (hasPermissions()) {
            action()
            return
        }
        pendingAfterPermission = action
        try {
            act.blePermissionLauncher.launch(requiredPermissions())
        } catch (e: Exception) {
            pendingAfterPermission = null
            state("error", "Permission request failed: ${e.message}")
        }
    }

    fun onPermissionResult(result: Map<String, Boolean>) {
        val action = pendingAfterPermission
        pendingAfterPermission = null
        if (hasPermissions()) action?.invoke()
        else state("no-permission", "Bluetooth permission was not granted (${result.filterValues { !it }.keys.joinToString { it.substringAfterLast('.') }})")
    }

    // ---------------------------------------------------------------- scan

    fun scan() {
        if (!supported()) { state("unsupported", "This device has no Bluetooth LE"); return }
        withPermissions { startScanChecked() }
    }

    private fun startScanChecked() {
        val a = adapter ?: return state("unsupported")
        if (!a.isEnabled) { state("off", "Bluetooth is turned off"); return }
        val scanner = a.bluetoothLeScanner ?: return state("off", "Bluetooth LE scanner unavailable")
        if (scanning) stopScan(report = false)
        seen.clear()
        val filters = listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(HRS)).build())
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        try {
            scanner.startScan(filters, settings, scanCallback)
        } catch (e: SecurityException) {
            state("no-permission", e.message); return
        }
        scanning = true
        main.removeCallbacks(stopRunnable)
        main.postDelayed(stopRunnable, SCAN_MS)
        var detail = "Heart Rate Service (0x180D), ${SCAN_MS / 1000} s"
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S && !locationEnabled()) {
            detail += "; Location is off, Android 11 and older return no scan results without it"
        }
        state("scanning", detail)
    }

    private fun locationEnabled(): Boolean {
        val lm = act.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return true
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) lm.isLocationEnabled
        else lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }

    fun stopScan(report: Boolean) {
        main.removeCallbacks(stopRunnable)
        if (scanning) {
            scanning = false
            try {
                if (adapter?.isEnabled == true && hasPermissions()) adapter.bluetoothLeScanner?.stopScan(scanCallback)
            } catch (e: Exception) {
                Log.w(TAG, "stopScan", e)
            }
        }
        if (report) state("stopped")
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) = handle(result)
        override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach(::handle)
        override fun onScanFailed(errorCode: Int) {
            scanning = false
            main.removeCallbacks(stopRunnable)
            state("error", "Scan failed (code $errorCode)")
        }

        private fun handle(r: ScanResult) {
            val addr = r.device?.address ?: return
            val name = r.scanRecord?.deviceName ?: try { r.device.name } catch (e: SecurityException) { null }
            val isNew = !seen.containsKey(addr)
            if (isNew || (seen[addr] == null && name != null)) {
                seen[addr] = name
                act.emit(
                    JSONObject().put("type", "ble-device")
                        .put("name", name ?: JSONObject.NULL)
                        .put("address", addr)
                        .put("rssi", r.rssi)
                )
            }
        }
    }

    // ---------------------------------------------------------------- connect

    fun connect(address: String) {
        if (!supported()) { state("unsupported"); return }
        if (!BluetoothAdapter.checkBluetoothAddress(address)) { state("error", "Invalid Bluetooth address"); return }
        withPermissions { connectChecked(address) }
    }

    private fun connectChecked(address: String) {
        val a = adapter ?: return state("unsupported")
        if (!a.isEnabled) { state("off", "Bluetooth is turned off"); return }
        stopScan(report = false)
        closeGatt()
        val device = a.getRemoteDevice(address)
        deviceLabel = seen[address] ?: (try { device.name } catch (e: SecurityException) { null }) ?: address
        state("connecting", deviceLabel)
        try {
            gatt = device.connectGatt(act, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
            if (gatt == null) state("error", "connectGatt returned null")
        } catch (e: SecurityException) {
            state("no-permission", e.message)
        }
    }

    fun disconnect() {
        val g = gatt ?: run { state("disconnected"); return }
        try { g.disconnect() } catch (e: Exception) { Log.w(TAG, "disconnect", e) }
        closeGatt()
        state("disconnected", deviceLabel)
    }

    private fun closeGatt() {
        val g = gatt ?: return
        gatt = null
        try { g.close() } catch (e: Exception) { Log.w(TAG, "close", e) }
    }

    fun shutdown() {
        stopScan(report = false)
        val g = gatt
        if (g != null) {
            try { g.disconnect() } catch (_: Exception) {}
            closeGatt()
        }
        pendingAfterPermission = null
    }

    private fun hex(bytes: ByteArray?): String =
        bytes?.joinToString("") { String.format("%02x", it.toInt() and 0xff) } ?: ""

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            val cur = gatt
            if (cur != null && g !== cur) { try { g.close() } catch (_: Exception) {}; return }
            when {
                newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS -> {
                    state("connected", deviceLabel)
                    if (!g.discoverServices()) state("error", "Service discovery could not start")
                }
                newState == BluetoothProfile.STATE_DISCONNECTED || status != BluetoothGatt.GATT_SUCCESS -> {
                    main.post {
                        if (gatt === g) closeGatt()
                    }
                    state("disconnected", if (status == BluetoothGatt.GATT_SUCCESS) deviceLabel else "$deviceLabel (status $status)")
                }
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) { state("error", "Service discovery failed (status $status)"); return }
            val svc = g.getService(HRS)
            if (svc == null) {
                state("error", "Heart Rate Service not found on this device")
                main.post { if (gatt === g) disconnect() }
                return
            }
            val hrm = svc.getCharacteristic(HRM)
            if (hrm == null) { state("error", "Heart Rate Measurement characteristic not found"); return }
            g.setCharacteristicNotification(hrm, true)
            val cccd = hrm.getDescriptor(CCCD)
            if (cccd == null) { readBodySensorLocation(g); return }
            val value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            val started = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                g.writeDescriptor(cccd, value) == BluetoothStatusCodes.SUCCESS
            } else {
                @Suppress("DEPRECATION")
                cccd.value = value
                @Suppress("DEPRECATION")
                g.writeDescriptor(cccd)
            }
            if (!started) state("error", "Could not enable heart-rate notifications")
        }

        override fun onDescriptorWrite(g: BluetoothGatt, d: BluetoothGattDescriptor, status: Int) {
            if (d.uuid == CCCD && status != BluetoothGatt.GATT_SUCCESS) {
                state("error", "Enabling notifications failed (status $status)")
            }
            readBodySensorLocation(g)
        }

        private fun readBodySensorLocation(g: BluetoothGatt) {
            val bsl = g.getService(HRS)?.getCharacteristic(BSL) ?: return
            try { g.readCharacteristic(bsl) } catch (e: Exception) { Log.w(TAG, "read BSL", e) }
        }

        override fun onCharacteristicRead(g: BluetoothGatt, c: BluetoothGattCharacteristic, value: ByteArray, status: Int) {
            onRead(c, value, status)
        }

        @Deprecated("API < 33")
        @Suppress("DEPRECATION")
        override fun onCharacteristicRead(g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int) {
            onRead(c, c.value, status)
        }

        private fun onRead(c: BluetoothGattCharacteristic, value: ByteArray?, status: Int) {
            if (c.uuid == BSL && status == BluetoothGatt.GATT_SUCCESS && value != null && value.isNotEmpty()) {
                act.emit(JSONObject().put("type", "ble-info").put("bodySensorLocation", value[0].toInt() and 0xff))
            }
        }

        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic, value: ByteArray) {
            onNotify(c, value)
        }

        @Deprecated("API < 33")
        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic) {
            onNotify(c, c.value)
        }

        private fun onNotify(c: BluetoothGattCharacteristic, value: ByteArray?) {
            if (c.uuid != HRM || value == null) return
            act.emit(
                JSONObject().put("type", "ble-hr").put("raw", hex(value))
                    .put("time", System.currentTimeMillis()).put("device", deviceLabel)
            )
        }
    }
}
