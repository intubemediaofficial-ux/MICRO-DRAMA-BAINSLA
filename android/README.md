# Intube Drama – native Android app

Kotlin + Jetpack Compose + Media3/ExoPlayer (no WebView). Talks to the website APIs
(`/api/mobile/*`, `/api/episodes/:id/playback`, `/api/auth/*`) with the same session cookie.

- Vertical episode feed; the next/previous episode is prepared in the background so swipes start instantly.
- HLS adaptive 360p/540p/720p, 500 MB disk cache for segments (playlists are never cached because they carry stream tokens).
- VIP is bought on the website (Razorpay); the app opens the browser for `/subscribe`.

Build: `ANDROID_HOME=<sdk> ./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`.
Release signing reads `keystore.properties` (storeFile, storePassword, keyAlias, keyPassword); it is git-ignored.
