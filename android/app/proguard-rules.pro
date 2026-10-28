# Methods called from JavaScript must keep their names.
-keepclassmembers class edu.deu.pmsim.PMBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
