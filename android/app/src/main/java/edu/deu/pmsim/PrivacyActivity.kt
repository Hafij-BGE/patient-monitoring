package edu.deu.pmsim

import android.app.Activity
import android.os.Bundle
import android.util.TypedValue
import android.widget.ScrollView
import android.widget.TextView

/**
 * Plain-text privacy statement shown by Health Connect (permissions rationale on
 * Android 13 and older, "view permission usage" on Android 14+) and nothing else.
 */
class PrivacyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val text = TextView(this).apply {
            setText(R.string.privacy_text)
            setTextColor(0xFFDCE6EE.toInt())
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
            setLineSpacing(0f, 1.25f)
            setPadding(pad, pad, pad, pad)
        }
        val scroll = ScrollView(this).apply {
            setBackgroundColor(MainActivity.BG)
            fitsSystemWindows = true
            addView(text)
        }
        setContentView(scroll)
    }
}
