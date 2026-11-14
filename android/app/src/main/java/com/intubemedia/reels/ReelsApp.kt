package com.intubemedia.reels

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import com.google.android.gms.ads.MobileAds

class ReelsApp : Application(), ImageLoaderFactory {
    private var configuredFirebase: FirebaseConfig? = null
    private var adsInitialized = false

    override fun onCreate() {
        super.onCreate()
        Net.init(this)
        AppPreferences.init(this)
        MediaCache.init(this)
        Analytics.start()
    }

    fun initializeConfiguredFeatures(config: MobileConfig) {
        config.firebase?.takeIf { it != configuredFirebase }?.let {
            PushNotifications.configure(this, it)
            configuredFirebase = it
        }
        if (config.adsEnabled && !adsInitialized) {
            MobileAds.initialize(this)
            adsInitialized = true
        }
    }

    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .okHttpClient { Net.client }
        .memoryCache { MemoryCache.Builder(this).maxSizePercent(0.2).build() }
        .diskCache { DiskCache.Builder().directory(cacheDir.resolve("images")).maxSizeBytes(100L * 1024 * 1024).build() }
        .crossfade(true)
        .build()
}
