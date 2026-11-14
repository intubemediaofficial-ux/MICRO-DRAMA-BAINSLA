package com.intubemedia.reels

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.content.pm.PackageManager
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.launch

object PushNotifications {
    var initializedFromConfig by mutableStateOf(false)
        private set

    fun configure(context: android.content.Context, config: FirebaseConfig) {
        val options = FirebaseOptions.Builder()
            .setApplicationId(config.appId)
            .setApiKey(config.apiKey)
            .setProjectId(config.projectId)
            .setGcmSenderId(config.senderId)
            .build()
        val app = runCatching { FirebaseApp.getInstance() }
            .getOrNull()
            ?: runCatching { FirebaseApp.initializeApp(context, options) }.getOrNull()
        initializedFromConfig = app?.options?.let {
            it.applicationId == config.appId &&
                it.apiKey == config.apiKey &&
                it.projectId == config.projectId &&
                it.gcmSenderId == config.senderId
        } == true
        if (initializedFromConfig) registerCurrentToken()
    }

    fun registerCurrentToken() {
        val app = runCatching { FirebaseApp.getInstance() }.getOrNull() ?: return
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            AppPreferences.pushToken = token
            AppScope.launch { Api.registerPushToken(token) }
        }
    }

    fun show(context: android.content.Context, message: RemoteMessage) {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel("updates", "Updates", NotificationManager.IMPORTANCE_DEFAULT),
            )
        }
        val slug = message.data["seriesSlug"]
        val episodeId = message.data["episodeId"]
        val path = when {
            slug != null && episodeId != null -> "/watch/${Uri.encode(episodeId)}?seriesSlug=${Uri.encode(slug)}"
            slug != null -> "/series/${Uri.encode(slug)}"
            episodeId != null -> "/watch/${Uri.encode(episodeId)}"
            else -> "/"
        }
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse(BuildConfig.BASE_URL + path)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            System.currentTimeMillis().toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, "updates")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(message.data["title"] ?: message.notification?.title ?: "Intube Reels")
            .setContentText(message.data["body"] ?: message.notification?.body.orEmpty())
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        if (
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            NotificationManagerCompat.from(context).notify(System.currentTimeMillis().toInt(), notification)
        }
    }
}

class ReelsMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        AppPreferences.pushToken = token
        AppScope.launch { Api.registerPushToken(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        PushNotifications.show(this, message)
    }
}
