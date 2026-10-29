package edu.deu.pmsim

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewAssetLoader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayInputStream

/**
 * Single-activity WebView host for the VitalsLab web app. The page is served from the APK
 * assets through [WebViewAssetLoader] at https://appassets.androidplatform.net/assets/www/.
 * Everything else (other hosts, external apps) is blocked. The app has no INTERNET permission.
 */
class MainActivity : ComponentActivity() {

    companion object {
        const val TAG = "PMSIM"
        const val HOST = "appassets.androidplatform.net"
        const val PROJECT_PATH = "/Hafij-BGE/patient-monitoring"
        const val ORIGIN = "https://$HOST"
        const val START_URL = "$ORIGIN/assets/www/index.html"
        const val BG = 0xFF0B0F14.toInt()

        fun originOf(url: String?): String? {
            if (url == null) return null
            val u = Uri.parse(url)
            val scheme = u.scheme ?: return null
            val host = u.host ?: return null
            return if (u.port == -1) "$scheme://$host" else "$scheme://$host:${u.port}"
        }
    }

    lateinit var webView: WebView
        private set

    /** Origin of the page currently shown; written on the UI thread, read from the JS bridge thread. */
    @Volatile
    var pageOrigin: String? = null
        private set

    lateinit var health: HealthBridge
        private set
    lateinit var ble: BleHeartRate
        private set

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSave: Pair<String, ByteArray>? = null

    private val openOne = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        deliverFiles(uri?.let { arrayOf(it) })
    }
    private val openMany = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        deliverFiles(uris.takeIf { it.isNotEmpty() }?.toTypedArray())
    }
    private val createDocument = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        onCreateDocumentResult(res.resultCode, res.data?.data)
    }
    val hcPermissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted -> health.onPermissionResult(granted) }

    val blePermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result -> ble.onPermissionResult(result) }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        health = HealthBridge(this)
        ble = BleHeartRate(this)

        // Draw edge to edge (forced on Android 15) but pad the content out of the system bars.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        val root = FrameLayout(this).apply { setBackgroundColor(BG) }
        webView = WebView(this).apply {
            setBackgroundColor(BG)
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        root.addView(webView)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or
                    WindowInsetsCompat.Type.displayCutout() or
                    WindowInsetsCompat.Type.ime()
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)

        configureWebView()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        val restored = savedInstanceState?.let { webView.restoreState(it) }
        if (restored == null || originOf(webView.url) != ORIGIN) webView.loadUrl(START_URL)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        // Remote debugging (chrome://inspect) only in debug builds.
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            safeBrowsingEnabled = true
            setGeolocationEnabled(false)
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            mediaPlaybackRequiresUserGesture = true
            cacheMode = WebSettings.LOAD_NO_CACHE
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val url = request.url
                if (url.scheme == "https" && url.host == HOST) {
                    if (url.path == "/favicon.ico") return blocked(204, "No Content")
                    return assetLoader.shouldInterceptRequest(url) ?: blocked(404, "Not Found")
                }
                // data:/blob: are handled by the renderer and never reach here; everything else is refused.
                return blocked(403, "Forbidden")
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                val allowed = url.scheme == "https" && url.host == HOST
                if (allowed) return false
                // The only outside page the app opens: the project's GitHub pages (source link and
                // "Share as community scenario"). They open in the browser; the app itself stays offline.
                if (url.scheme == "https" && url.host == "github.com" && url.path.orEmpty().let { it == PROJECT_PATH || it.startsWith("$PROJECT_PATH/") }) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE))
                    } catch (e: ActivityNotFoundException) {
                        Log.i(TAG, "No browser for $url")
                    }
                    return true
                }
                Log.i(TAG, "Blocked navigation to ${url.scheme}://${url.host}")
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                pageOrigin = originOf(url)
            }

            override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
                pageOrigin = originOf(url)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                pageOrigin = originOf(url)
                Log.i(TAG, "Page loaded: $url")
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val mimes = mimeTypesFor(params.acceptTypes)
                try {
                    if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) openMany.launch(mimes)
                    else openOne.launch(mimes)
                } catch (e: ActivityNotFoundException) {
                    Log.w(TAG, "No document picker available", e)
                    deliverFiles(null)
                }
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                request.deny()
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?, callback: GeolocationPermissions.Callback
            ) {
                callback.invoke(origin, false, false)
            }

            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                Log.println(
                    if (msg.messageLevel() == ConsoleMessage.MessageLevel.ERROR) Log.ERROR else Log.DEBUG,
                    "$TAG-console",
                    "${msg.message()} (${msg.sourceId()?.substringAfterLast('/')}:${msg.lineNumber()})"
                )
                return true
            }
        }

        webView.setDownloadListener { _, _, _, _, _ ->
            // blob: downloads cannot be fetched under the page CSP; the page should use PMAndroid.saveText/saveBase64.
            emit(JSONObject().put("type", "download-unsupported"))
        }

        webView.addJavascriptInterface(PMBridge(this), "PMAndroid")
    }

    private fun blocked(code: Int, reason: String) =
        WebResourceResponse("text/plain", "utf-8", code, reason, emptyMap(), ByteArrayInputStream(ByteArray(0)))

    /** Maps `accept` tokens (extensions or MIME types) to MIME types for the document picker. */
    private fun mimeTypesFor(accept: Array<String>?): Array<String> {
        val tokens = accept.orEmpty()
            .flatMap { it.split(',') }
            .map { it.trim().lowercase() }
            .filter { it.isNotEmpty() }
        if (tokens.isEmpty()) return arrayOf("*/*")
        val out = LinkedHashSet<String>()
        for (t in tokens) {
            val mapped = when (t) {
                ".csv" -> listOf("text/csv", "text/comma-separated-values", "application/csv", "text/plain")
                ".tsv" -> listOf("text/tab-separated-values", "text/plain")
                ".txt" -> listOf("text/plain")
                ".json" -> listOf("application/json", "text/json", "text/plain")
                ".xml" -> listOf("text/xml", "application/xml")
                else -> if (t.contains('/')) listOf(t) else null
            }
            // An extension with no reliable MIME type (e.g. .hl7) forces an unfiltered picker.
            if (mapped == null) return arrayOf("*/*")
            out += mapped
        }
        return out.toTypedArray()
    }

    private fun deliverFiles(uris: Array<Uri>?) {
        val cb = fileCallback
        fileCallback = null
        cb?.onReceiveValue(uris)
    }

    // ---------------------------------------------------------------- save files

    fun saveFile(name: String, mime: String, bytes: ByteArray) {
        pendingSave = name to bytes
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mime.ifBlank { "application/octet-stream" }
            putExtra(Intent.EXTRA_TITLE, name)
        }
        try {
            createDocument.launch(intent)
        } catch (e: ActivityNotFoundException) {
            pendingSave = null
            emit(JSONObject().put("type", "save").put("ok", false).put("name", name).put("error", "No document provider"))
        }
    }

    private fun onCreateDocumentResult(resultCode: Int, uri: Uri?) {
        val save = pendingSave ?: return
        pendingSave = null
        if (resultCode != Activity.RESULT_OK || uri == null) {
            emit(JSONObject().put("type", "save").put("ok", false).put("name", save.first).put("error", "cancelled"))
            return
        }
        lifecycleScope.launch {
            val err = withContext(Dispatchers.IO) {
                try {
                    contentResolver.openOutputStream(uri, "wt")?.use { it.write(save.second) } ?: return@withContext "Could not open output"
                    null
                } catch (e: Exception) {
                    "${e.javaClass.simpleName}: ${e.message}"
                }
            }
            val ev = JSONObject().put("type", "save").put("ok", err == null).put("name", save.first)
            if (err != null) ev.put("error", err)
            emit(ev)
        }
    }

    fun decodeBase64(b64: String): ByteArray? = try {
        Base64.decode(b64, Base64.DEFAULT)
    } catch (e: IllegalArgumentException) {
        null
    }

    // ---------------------------------------------------------------- events to JS

    /** Dispatches `window` CustomEvent 'pmandroid' with [detail] to the page, on the UI thread. */
    fun emit(detail: JSONObject) {
        // JSONObject output is valid JSON; additionally escape U+2028/2029 so the JS source stays safe.
        val json = detail.toString().replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
        val js = "window.dispatchEvent(new CustomEvent('pmandroid',{detail:$json}))"
        val run = Runnable {
            if (isDestroyed || !::webView.isInitialized) return@Runnable
            if (originOf(webView.url) != ORIGIN) return@Runnable
            webView.evaluateJavascript(js, null)
        }
        if (Looper.myLooper() == Looper.getMainLooper()) run.run() else runOnUiThread(run)
    }

    /** Runs [block] on the UI thread only if the current page still comes from the app assets origin. */
    fun onUiIfTrusted(block: () -> Unit) {
        runOnUiThread {
            if (isDestroyed) return@runOnUiThread
            if (originOf(webView.url) != ORIGIN) {
                Log.w(TAG, "Ignored bridge call from untrusted origin")
                return@runOnUiThread
            }
            block()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        ble.shutdown()
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface("PMAndroid")
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.destroy()
        }
        super.onDestroy()
    }
}
