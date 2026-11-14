package com.intubemedia.reels

import android.content.Context
import android.content.Intent
import android.net.Uri

fun shareSeries(context: Context, title: String, slug: String) {
    val url = "${BuildConfig.BASE_URL}/series/${Uri.encode(slug)}"
    shareText(context, title, "$title\n$url")
}

fun shareText(context: Context, title: String, text: String) {
    Analytics.track("share", props = org.json.JSONObject().put("title", title))
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TITLE, title)
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, "Share"))
}
