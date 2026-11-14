@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.intubemedia.reels

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.view.ViewGroup
import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.media3.common.PlaybackException
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.OnUserEarnedRewardListener
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.gms.ads.rewarded.ServerSideVerificationOptions
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.launch

private object PlayerCoordinator {
    private val lock = Any()
    private val players = mutableSetOf<ExoPlayer>()

    fun register(player: ExoPlayer) = synchronized(lock) { players.add(player) }

    fun unregister(player: ExoPlayer) {
        synchronized(lock) { players.remove(player) }
    }

    fun releasePreloadedPlayers(except: ExoPlayer) {
        val preloaded = synchronized(lock) { players.filter { it !== except } }
        preloaded.forEach { runCatching { it.stop() } }
    }
}

/** Full-screen vertical feed of a series; neighbouring episodes are prepared so a swipe starts instantly. */
@Composable
fun PlayerScreen(
    slug: String,
    episodeId: String,
    startPositionSec: Int,
    onBack: () -> Unit,
    onLogin: () -> Unit,
    openWeb: (String) -> Unit,
) {
    val context = LocalContext.current
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    var firstPlaybackStarted by remember { mutableStateOf(false) }
    val onFirstPlayback = {
        if (!firstPlaybackStarted) {
            firstPlaybackStarted = true
        }
    }
    LaunchedEffect(firstPlaybackStarted, PushNotifications.initializedFromConfig) {
        if (
            firstPlaybackStarted &&
            PushNotifications.initializedFromConfig &&
            Build.VERSION.SDK_INT >= 33 &&
            !AppPreferences.notificationPermissionRequested
        ) {
            AppPreferences.notificationPermissionRequested = true
            if (
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
    var detail by remember { mutableStateOf<SeriesDetail?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(slug) {
        runCatching { Api.series(slug) }.onSuccess { detail = it }.onFailure { error = it.message }
    }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        val series = detail
        when {
            series != null -> {
                val start = series.episodes.indexOfFirst { it.id == episodeId }.coerceAtLeast(0)
                val pager = rememberPagerState(initialPage = start) { series.episodes.size }
                val scope = rememberCoroutineScope()
                var pendingStartPositionSec by remember(episodeId) { mutableIntStateOf(startPositionSec) }
                VerticalPager(state = pager, beyondViewportPageCount = 1, modifier = Modifier.fillMaxSize()) { page ->
                    EpisodePage(
                        series = series,
                        episode = series.episodes[page],
                        startPositionSec = if (page == start) pendingStartPositionSec else 0,
                        onStartPositionConsumed = { pendingStartPositionSec = 0 },
                        onFirstPlayback = onFirstPlayback,
                        active = pager.settledPage == page,
                        onEnded = {
                            if (page + 1 < series.episodes.size) scope.launch { pager.animateScrollToPage(page + 1) }
                        },
                        onLogin = onLogin,
                        openWeb = openWeb,
                    )
                }
            }
            error != null -> Text(error!!, color = Color.White, modifier = Modifier.align(Alignment.Center))
            else -> CircularProgressIndicator(Modifier.align(Alignment.Center))
        }
        IconButton(onClick = onBack, modifier = Modifier.statusBarsPadding().padding(4.dp)) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
        }
    }
}

@Composable
private fun EpisodePage(
    series: SeriesDetail,
    episode: EpisodeItem,
    startPositionSec: Int,
    onStartPositionConsumed: () -> Unit,
    onFirstPlayback: () -> Unit,
    active: Boolean,
    onEnded: () -> Unit,
    onLogin: () -> Unit,
    openWeb: (String) -> Unit,
) {
    val context = LocalContext.current
    var attempt by remember { mutableIntStateOf(0) }
    var playback by remember { mutableStateOf<Playback?>(null) }
    LaunchedEffect(episode.id, attempt, AppState.authVersion) { playback = Api.playback(episode.id) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        // A VIP purchase happens in the browser; re-check entitlement when the user comes back.
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && playback is Playback.Locked) attempt++
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    Box(Modifier.fillMaxSize()) {
        when (val state = playback) {
            null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
            // Keyed so a retry rebuilds the player together with all of its error/progress state.
            is Playback.Ready -> key(state.url, attempt) {
                VideoView(episode, state, active, startPositionSec, onStartPositionConsumed, onFirstPlayback, onEnded) { attempt++ }
            }
            is Playback.Locked -> LockedView(state, episode, onLogin, openWeb) { attempt++ }
            is Playback.Failed -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(state.message, color = Color.White)
                Spacer(Modifier.height(12.dp))
                Button(onClick = { attempt++ }) { Text("Retry") }
            }
        }
        Column(
            Modifier.align(Alignment.BottomStart).fillMaxWidth()
                .background(Color.Black.copy(alpha = 0.35f))
                .navigationBarsPadding().padding(16.dp),
        ) {
            Text(series.title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text("EP ${episode.number} / ${series.episodes.size}", color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp)
        }
        TextButton(
            onClick = { shareSeries(context, series.title, series.slug) },
            modifier = Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(8.dp),
        ) { Text("Share", color = Color.White) }
    }
}

@Composable
private fun VideoView(
    episode: EpisodeItem,
    ready: Playback.Ready,
    active: Boolean,
    startPositionSec: Int,
    onStartPositionConsumed: () -> Unit,
    onFirstPlayback: () -> Unit,
    onEnded: () -> Unit,
    onRetry: () -> Unit,
) {
    val context = LocalContext.current
    var buffering by remember { mutableStateOf(true) }
    var paused by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    var decoderRetryCount by remember(episode.id) { mutableIntStateOf(0) }
    var prepared by remember(episode.id) { mutableStateOf(false) }
    var playbackStarted by remember(episode.id) { mutableStateOf(false) }
    val sentMilestones = remember(episode.id) { mutableSetOf<Int>() }
    var progress by remember { mutableFloatStateOf(0f) }
    var resizeMode by remember { mutableIntStateOf(AspectRatioFrameLayout.RESIZE_MODE_ZOOM) }
    var subtitleLanguage by remember(episode.id) { mutableStateOf(AppPreferences.subtitleLanguage) }
    val subtitleChoices = listOf("off") + ready.subtitles.map { it.lang }
    val player = remember(ready.url) {
        MediaCache.newPlayer(context).apply {
            PlayerCoordinator.register(this)
            setMediaItem(MediaCache.mediaItem(ready))
            val selectedLanguage = subtitleLanguage
            trackSelectionParameters = trackSelectionParameters.buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, selectedLanguage == "off")
                .apply { if (selectedLanguage != "off") setPreferredTextLanguage(selectedLanguage) }
                .build()
            val resumeSec = startPositionSec.takeIf { it > 0 } ?: ready.resumeSec
            if (resumeSec > 0) seekTo(resumeSec * 1000L)
            if (startPositionSec > 0) onStartPositionConsumed()
            playWhenReady = false
        }
    }
    val isActive by rememberUpdatedState(active)
    DisposableEffect(player) {
        var completedPlayback = false
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) {
                    onFirstPlayback()
                    if (!playbackStarted) {
                        playbackStarted = true
                        Analytics.track("play_start", episodeId = episode.id)
                    }
                }
            }

            override fun onPlaybackStateChanged(state: Int) {
                buffering = state == Player.STATE_BUFFERING || state == Player.STATE_IDLE
                if (state == Player.STATE_ENDED) {
                    completedPlayback = true
                    val durationSec = (player.duration / 1000).toInt()
                    Analytics.track("play_complete", episodeId = episode.id, positionSec = durationSec)
                    AppScope.launch { Api.saveProgress(episode.id, durationSec, true) }
                    onEnded()
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                if (error.errorCode == PlaybackException.ERROR_CODE_DECODER_INIT_FAILED) {
                    if (!isActive) {
                        player.stop()
                        return
                    }
                    if (decoderRetryCount == 0) {
                        decoderRetryCount++
                        failed = false
                        buffering = true
                        PlayerCoordinator.releasePreloadedPlayers(player)
                        player.stop()
                        player.prepare()
                        prepared = true
                        return
                    }
                }
                failed = true
            }

            override fun onVideoSizeChanged(size: VideoSize) {
                if (size.height == 0) return
                val ratio = size.width.toFloat() * size.pixelWidthHeightRatio / size.height
                // Fill the screen for vertical 9:16-ish video; letterbox anything wider.
                resizeMode = if (ratio in 0.5f..0.66f) AspectRatioFrameLayout.RESIZE_MODE_ZOOM else AspectRatioFrameLayout.RESIZE_MODE_FIT
            }
        }
        player.addListener(listener)
        player.prepare()
        prepared = true
        onDispose {
            PlayerCoordinator.unregister(player)
            if (player.currentPosition > 0 && !completedPlayback) {
                val position = (player.currentPosition / 1000).toInt()
                AppScope.launch { Api.saveProgress(episode.id, position, false) }
            }
            player.removeListener(listener)
            player.release()
        }
    }
    LaunchedEffect(active, paused, prepared) {
        if (active && prepared && player.playbackState == Player.STATE_IDLE) player.prepare()
        player.playWhenReady = active && !paused
    }
    LaunchedEffect(active) {
        while (active) {
            delay(500)
            if (player.duration > 0) {
                progress = player.currentPosition.toFloat() / player.duration
                val positionSec = (player.currentPosition / 1000).toInt()
                listOf(25, 50, 75).forEach { milestone ->
                    if (progress >= milestone / 100f && sentMilestones.add(milestone)) {
                        Analytics.track("play_$milestone", episodeId = episode.id, positionSec = positionSec)
                    }
                }
            }
            if ((player.currentPosition / 500) % 20 == 0L && player.isPlaying) {
                Api.saveProgress(episode.id, (player.currentPosition / 1000).toInt(), false)
            }
        }
    }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, player) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) player.pause()
            if (event == Lifecycle.Event.ON_START && isActive && !paused) player.play()
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    Box(
        Modifier.fillMaxSize().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
            paused = !paused
        },
    ) {
        AndroidView(
            factory = {
                PlayerView(it).apply {
                    useController = false
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                    subtitleView?.setBottomPaddingFraction(0.25f)
                    layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                }
            },
            update = {
                it.player = player
                it.resizeMode = resizeMode
                it.keepScreenOn = active
            },
            modifier = Modifier.fillMaxSize(),
        )
        if (failed) {
            Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Video could not load", color = Color.White)
                Spacer(Modifier.height(12.dp))
                Button(onClick = onRetry) { Text("Retry") }
            }
        } else if (buffering && active) {
            CircularProgressIndicator(Modifier.align(Alignment.Center), color = Color.White)
        }
        if (paused) {
            Icon(
                Icons.Filled.PlayArrow,
                contentDescription = "Play",
                tint = Color.White,
                modifier = Modifier.align(Alignment.Center).size(72.dp),
            )
        }
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().height(2.dp),
            color = Color.White,
            trackColor = Color.White.copy(alpha = 0.2f),
        )
        if (ready.subtitles.isNotEmpty()) {
            TextButton(
                onClick = {
                    val next = subtitleChoices[(subtitleChoices.indexOf(subtitleLanguage) + 1) % subtitleChoices.size]
                    subtitleLanguage = next
                    AppPreferences.subtitleLanguage = next
                    player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
                        .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, next == "off")
                        .apply { if (next != "off") setPreferredTextLanguage(next) }
                        .build()
                },
                modifier = Modifier.align(Alignment.BottomEnd).navigationBarsPadding().padding(bottom = 32.dp, end = 12.dp),
            ) { Text(if (subtitleLanguage == "off") "CC Off" else "CC $subtitleLanguage", color = Color.White) }
        }
    }
}

@Composable
private fun LockedView(
    state: Playback.Locked,
    episode: EpisodeItem,
    onLogin: () -> Unit,
    openWeb: (String) -> Unit,
    onUnlocked: () -> Unit,
) {
    LaunchedEffect(episode.id) { Analytics.track("unlock_prompt", episodeId = episode.id) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var adsAvailable by remember { mutableStateOf(MobileConfigState.current.adsEnabled) }
    val adsEnabled = MobileConfigState.current.adsEnabled && adsAvailable && !state.needsLogin
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Filled.Lock, contentDescription = null, tint = Color.White, modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(12.dp))
        Text("Episode ${episode.number} is locked", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Spacer(Modifier.height(20.dp))
        if (state.needsLogin) {
            Button(onClick = onLogin) { Text("Log in to continue") }
        } else {
            Button(
                enabled = !busy,
                onClick = {
                    busy = true
                    scope.launch {
                        runCatching { Api.unlockWithCoins(episode.id) }
                            .onSuccess { onUnlocked() }
                            .onFailure { message = it.message }
                        busy = false
                    }
                },
            ) { Text("Unlock for ${state.coinPrice} coins") }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = {
                Analytics.track("subscribe_click", episodeId = episode.id)
                openWeb("/subscribe?episode=${episode.id}")
            }) { Text("Get VIP – watch everything", color = Color.White) }
            if (adsEnabled) {
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    enabled = !busy,
                    onClick = {
                        busy = true
                        message = null
                        scope.launch {
                            try {
                                val (token, unitId) = Api.requestRewardToken(episode.id)
                                val activity = context as? Activity ?: error("Ad unavailable")
                                val ad = loadRewardedAd(context, unitId)
                                ad.setServerSideVerificationOptions(
                                    ServerSideVerificationOptions.Builder().setCustomData(token).build(),
                                )
                                ad.fullScreenContentCallback = object : FullScreenContentCallback() {
                                    override fun onAdDismissedFullScreenContent() {
                                        busy = false
                                    }
                                    override fun onAdFailedToShowFullScreenContent(error: com.google.android.gms.ads.AdError) {
                                        message = "Ad failed to load"
                                        busy = false
                                    }
                                }
                                ad.show(activity, OnUserEarnedRewardListener {
                                    scope.launch {
                                        try {
                                            val deadline = System.currentTimeMillis() + 12_000
                                            while (true) {
                                                try {
                                                    Api.unlockWithAd(episode.id, token)
                                                    Analytics.track("ad_reward", episodeId = episode.id)
                                                    onUnlocked()
                                                    break
                                                } catch (error: ApiException) {
                                                    if (error.status == 403 && error.message?.contains("Ad not verified yet") == true &&
                                                        System.currentTimeMillis() < deadline
                                                    ) {
                                                        delay(1_500)
                                                    } else {
                                                        throw error
                                                    }
                                                }
                                            }
                                        } catch (error: Exception) {
                                            message = error.message ?: "Ad unlock failed"
                                        } finally {
                                            busy = false
                                        }
                                    }
                                })
                            } catch (error: Exception) {
                                if (error is ApiException && error.status == 429) {
                                    message = "Daily ad unlock limit reached"
                                } else if (error is ApiException && error.status != 503 && error.status != 404) {
                                    message = error.message ?: "Ad unavailable"
                                }
                                adsAvailable = error is ApiException && error.status != 503 && error.status != 404 && error.status != 429
                                if (error !is ApiException) message = "Ad failed to load"
                                busy = false
                            }
                        }
                    },
                ) { Text("Watch ad to unlock", color = Color.White) }
            }
        }
        message?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = Color(0xFFFF8A80))
        }
        Row {}
    }
}

private suspend fun loadRewardedAd(context: android.content.Context, unitId: String): RewardedAd =
    suspendCancellableCoroutine { continuation ->
        RewardedAd.load(
            context,
            unitId,
            AdRequest.Builder().build(),
            object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) {
                    if (continuation.isActive) continuation.resume(ad)
                }

                override fun onAdFailedToLoad(error: LoadAdError) {
                    if (continuation.isActive) continuation.resumeWithException(IllegalStateException(error.message))
                }
            },
        )
    }
