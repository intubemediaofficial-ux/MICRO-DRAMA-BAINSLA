package com.intubemedia.reels

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import kotlinx.coroutines.launch
import com.google.android.gms.ads.MobileAds

class ReelsApp : Application(), ImageLoaderFactory {
    override fun onCreate() {
        super.onCreate()
        Net.init(this)
        AppPreferences.init(this)
        MediaCache.init(this)
        AppScope.launch {
            val config = Api.config(refresh = true)
            config.firebase?.let { PushNotifications.configure(this@ReelsApp, it) }
            if (config.adsEnabled) MobileAds.initialize(this@ReelsApp)
        }
    }

    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .okHttpClient { Net.client }
        .memoryCache { MemoryCache.Builder(this).maxSizePercent(0.2).build() }
        .diskCache { DiskCache.Builder().directory(cacheDir.resolve("images")).maxSizeBytes(100L * 1024 * 1024).build() }
        .crossfade(true)
        .build()
}
