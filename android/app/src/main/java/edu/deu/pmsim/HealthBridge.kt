package edu.deu.pmsim

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.RemoteException
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.BodyTemperatureRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.Duration
import java.time.Instant
import kotlin.reflect.KClass

/**
 * Health Connect access for the JS bridge: status, permission request, and a bounded
 * read of the last 1..30 days. Read-only; data goes only to the local WebView.
 */
class HealthBridge(private val act: MainActivity) {

    companion object {
        private const val TAG = "PMSIM-HC"
        private const val PROVIDER = "com.google.android.apps.healthdata"
        const val CAP_PER_TYPE = 5000
        private const val PAGE_SIZE = 1000

        val TYPES: List<KClass<out Record>> = listOf(
            HeartRateRecord::class,
            OxygenSaturationRecord::class,
            RespiratoryRateRecord::class,
            BloodPressureRecord::class,
            BodyTemperatureRecord::class,
            WeightRecord::class,
            HeightRecord::class,
            StepsRecord::class,
        )

        fun permissionFor(type: KClass<out Record>): String = HealthPermission.getReadPermission(type)
        fun nameOf(type: KClass<out Record>): String = type.simpleName ?: type.java.simpleName
    }

    private val permissions: Set<String> = TYPES.map(::permissionFor).toSet()

    /** "available" | "not-installed" | "update-required" | "unsupported" */
    fun status(): String = when (HealthConnectClient.getSdkStatus(act, PROVIDER)) {
        HealthConnectClient.SDK_AVAILABLE -> "available"
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
            if (isProviderInstalled()) "update-required" else "not-installed"
        else -> "unsupported"
    }

    private fun isProviderInstalled(): Boolean = try {
        act.packageManager.getPackageInfo(PROVIDER, 0)
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }

    private fun emitStatus(status: String) {
        act.emit(JSONObject().put("type", "hc-status").put("status", status))
    }

    /** UI thread. */
    fun requestPermissions() {
        val st = status()
        if (st != "available") {
            emitStatus(st)
            return
        }
        try {
            act.hcPermissionLauncher.launch(permissions)
        } catch (e: Exception) {
            Log.w(TAG, "Permission request failed", e)
            act.emit(
                JSONObject().put("type", "hc-permissions")
                    .put("granted", JSONArray())
                    .put("denied", JSONArray(TYPES.map(::nameOf)))
                    .put("error", "${e.javaClass.simpleName}: ${e.message}")
            )
        }
    }

    /** Activity-result callback. Re-queries Health Connect so previously granted types count too. */
    fun onPermissionResult(@Suppress("UNUSED_PARAMETER") justGranted: Set<String>) {
        act.lifecycleScope.launch {
            val granted: Set<String> = try {
                HealthConnectClient.getOrCreate(act).permissionController.getGrantedPermissions()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "getGrantedPermissions failed", e)
                justGranted
            }
            val g = JSONArray()
            val d = JSONArray()
            for (t in TYPES) if (permissionFor(t) in granted) g.put(nameOf(t)) else d.put(nameOf(t))
            act.emit(JSONObject().put("type", "hc-permissions").put("granted", g).put("denied", d))
        }
    }

    /** UI thread. Reads granted types over the last [days] (clamped 1..30) and emits one hc-records event. */
    fun read(days: Int) {
        val d = days.coerceIn(1, 30)
        act.lifecycleScope.launch {
            val records = JSONArray()
            val errors = JSONArray()
            val st = status()
            if (st != "available") {
                errors.put(JSONObject().put("type", "HealthConnect").put("error", "Health Connect status: $st"))
            } else {
                withContext(Dispatchers.IO) { readAll(d, records, errors) }
            }
            act.emit(
                JSONObject().put("type", "hc-records").put("days", d)
                    .put("records", records).put("errors", errors)
            )
        }
    }

    private suspend fun readAll(days: Int, records: JSONArray, errors: JSONArray) {
        val client = try {
            HealthConnectClient.getOrCreate(act)
        } catch (e: Exception) {
            errors.put(JSONObject().put("type", "HealthConnect").put("error", describe(e)))
            return
        }
        val granted: Set<String> = try {
            client.permissionController.getGrantedPermissions()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            errors.put(JSONObject().put("type", "HealthConnect").put("error", describe(e)))
            return
        }
        val end = Instant.now()
        val filter = TimeRangeFilter.between(end.minus(Duration.ofDays(days.toLong())), end)

        for (type in TYPES) {
            val name = nameOf(type)
            if (permissionFor(type) !in granted) {
                errors.put(JSONObject().put("type", name).put("error", "permission not granted"))
                continue
            }
            try {
                val truncated = readType(client, type, filter, records)
                if (truncated) {
                    errors.put(
                        JSONObject().put("type", name)
                            .put("error", "truncated: only the newest $CAP_PER_TYPE values were read")
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                errors.put(JSONObject().put("type", name).put("error", describe(e)))
            } catch (e: RemoteException) {
                errors.put(JSONObject().put("type", name).put("error", describe(e)))
            } catch (e: IOException) {
                errors.put(JSONObject().put("type", name).put("error", describe(e)))
            } catch (e: Exception) {
                errors.put(JSONObject().put("type", name).put("error", describe(e)))
            }
        }
    }

    private fun describe(e: Throwable) = "${e.javaClass.simpleName}: ${e.message ?: "no message"}"

    /** Returns true when the per-type cap was hit. Newest first so a cap drops the oldest values. */
    private suspend fun <T : Record> readType(
        client: HealthConnectClient,
        type: KClass<T>,
        filter: TimeRangeFilter,
        out: JSONArray
    ): Boolean {
        val typeName = nameOf(type)
        var count = 0
        var token: String? = null
        fun add(param: String, value: Double, unit: String, time: Instant, origin: String) {
            if (!value.isFinite()) return
            out.put(
                JSONObject().put("param", param).put("value", value).put("unit", unit)
                    .put("time", time.toEpochMilli()).put("origin", origin).put("type", typeName)
            )
        }
        do {
            val resp = client.readRecords(
                ReadRecordsRequest(
                    recordType = type,
                    timeRangeFilter = filter,
                    ascendingOrder = false,
                    pageSize = PAGE_SIZE,
                    pageToken = token
                )
            )
            for (r in resp.records) {
                if (count >= CAP_PER_TYPE) return true
                val origin = r.metadata.dataOrigin.packageName
                when (r) {
                    is HeartRateRecord -> for (s in r.samples) {
                        if (count >= CAP_PER_TYPE) return true
                        add("hr", s.beatsPerMinute.toDouble(), "bpm", s.time, origin); count++
                    }
                    is OxygenSaturationRecord -> { add("spo2", r.percentage.value, "%", r.time, origin); count++ }
                    is RespiratoryRateRecord -> { add("rr", r.rate, "br/min", r.time, origin); count++ }
                    is BloodPressureRecord -> {
                        add("sbp", r.systolic.inMillimetersOfMercury, "mmHg", r.time, origin)
                        add("dbp", r.diastolic.inMillimetersOfMercury, "mmHg", r.time, origin)
                        count++
                    }
                    is BodyTemperatureRecord -> { add("temp", r.temperature.inCelsius, "°C", r.time, origin); count++ }
                    is WeightRecord -> { add("weight", r.weight.inKilograms, "kg", r.time, origin); count++ }
                    is HeightRecord -> { add("height", r.height.inMeters * 100.0, "cm", r.time, origin); count++ }
                    is StepsRecord -> { add("steps", r.count.toDouble(), "steps", r.startTime, origin); count++ }
                }
            }
            token = resp.pageToken
        } while (token != null && count < CAP_PER_TYPE)
        return token != null
    }

    /** Opens the Play Store page for Health Connect (only when the web UI asks after a user tap). */
    fun openInstallPage() {
        val uri = Uri.parse("market://details?id=$PROVIDER&url=healthconnect%3A%2F%2Fonboarding")
        val intent = Intent(Intent.ACTION_VIEW, uri).setPackage("com.android.vending")
            .putExtra("overlay", true).putExtra("callerId", act.packageName)
        try {
            act.startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            emitStatus(status())
        }
    }
}
