package edu.deu.pmsim

import android.os.Build
import android.webkit.JavascriptInterface
import org.json.JSONObject

/**
 * JavaScript bridge exposed as `window.PMAndroid`.
 *
 * Every method returns immediately. Results that take time are delivered as
 * `window` CustomEvents named `pmandroid` (see [MainActivity.emit]). Each call is ignored
 * unless the page currently shown comes from https://appassets.androidplatform.net.
 *
 * Methods run on the WebView "JavaBridge" thread, so anything touching the WebView,
 * activity-result launchers or Bluetooth state is posted to the UI thread.
 */
class PMBridge(private val act: MainActivity) {

    private fun trusted(): Boolean = act.pageOrigin == MainActivity.ORIGIN

    @JavascriptInterface
    fun info(): String {
        if (!trusted()) return "{}"
        return JSONObject()
            .put("platform", "android")
            .put("appVersion", BuildConfig.VERSION_NAME)
            .put("sdk", Build.VERSION.SDK_INT)
            .put("healthConnect", act.health.status())
            .put("ble", act.ble.status())
            .toString()
    }

    // ---------------------------------------------------------------- Health Connect

    @JavascriptInterface
    fun hcRequestPermissions() {
        if (!trusted()) return
        act.onUiIfTrusted { act.health.requestPermissions() }
    }

    @JavascriptInterface
    fun hcRead(days: Int) {
        if (!trusted()) return
        act.onUiIfTrusted { act.health.read(days) }
    }

    /** Extra (optional): opens the Health Connect install/update page. Call only from a user tap. */
    @JavascriptInterface
    fun hcOpenInstall() {
        if (!trusted()) return
        act.onUiIfTrusted { act.health.openInstallPage() }
    }

    // ---------------------------------------------------------------- Bluetooth LE

    @JavascriptInterface
    fun bleScan() {
        if (!trusted()) return
        act.onUiIfTrusted { act.ble.scan() }
    }

    @JavascriptInterface
    fun bleStop() {
        if (!trusted()) return
        act.onUiIfTrusted { act.ble.stopScan(report = true) }
    }

    @JavascriptInterface
    fun bleConnect(address: String?) {
        if (!trusted()) return
        val addr = address ?: return
        act.onUiIfTrusted { act.ble.connect(addr) }
    }

    @JavascriptInterface
    fun bleDisconnect() {
        if (!trusted()) return
        act.onUiIfTrusted { act.ble.disconnect() }
    }

    // ---------------------------------------------------------------- save (extra)

    /** Extra: save text through the system "create document" picker. Result: event {type:"save",ok,name,error?}. */
    @JavascriptInterface
    fun saveText(name: String?, mime: String?, text: String?) {
        if (!trusted()) return
        val bytes = (text ?: "").toByteArray(Charsets.UTF_8)
        act.onUiIfTrusted { act.saveFile(safeName(name), mime ?: "text/plain", bytes) }
    }

    /** Extra: save binary data (base64, e.g. a PNG from canvas.toDataURL without the prefix). */
    @JavascriptInterface
    fun saveBase64(name: String?, mime: String?, base64: String?) {
        if (!trusted()) return
        val bytes = act.decodeBase64(base64 ?: "")
        if (bytes == null) {
            act.emit(JSONObject().put("type", "save").put("ok", false).put("name", safeName(name)).put("error", "invalid base64"))
            return
        }
        act.onUiIfTrusted { act.saveFile(safeName(name), mime ?: "application/octet-stream", bytes) }
    }

    private fun safeName(name: String?): String =
        (name ?: "pmsim-export").replace(Regex("""[\\/:*?"<>|\u0000-\u001f]"""), "_").take(120).ifBlank { "pmsim-export" }
}
