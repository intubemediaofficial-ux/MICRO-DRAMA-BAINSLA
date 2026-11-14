package com.intubemedia.reels

import android.content.Context
import java.util.UUID

object AppPreferences {
    private lateinit var prefs: android.content.SharedPreferences

    fun init(context: Context) {
        prefs = context.getSharedPreferences("app", Context.MODE_PRIVATE)
    }

    var pendingReferralCode: String?
        get() = prefs.getString("pendingReferralCode", null)
        set(value) {
            prefs.edit().putString("pendingReferralCode", value).apply()
        }

    var notificationPermissionRequested: Boolean
        get() = prefs.getBoolean("notificationPermissionRequested", false)
        set(value) {
            prefs.edit().putBoolean("notificationPermissionRequested", value).apply()
        }

    var subtitleLanguage: String
        get() = prefs.getString("subtitleLanguage", "off") ?: "off"
        set(value) {
            prefs.edit().putString("subtitleLanguage", value).apply()
        }

    val deviceId: String
        get() = prefs.getString("deviceId", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("deviceId", it).apply()
        }
}
