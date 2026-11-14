package com.intubemedia.reels

import android.content.Context
import android.content.Intent
import android.net.Uri

fun shareSeries(context: Context, title: String, slug: String) {
    val url = "${BuildConfig.BASE_URL}/series/${Uri.encode(slug)}"
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TITLE, title)
        putExtra(Intent.EXTRA_TEXT, "$title\n$url")
    }
    context.startActivity(Intent.createChooser(intent, "Share"))
}
