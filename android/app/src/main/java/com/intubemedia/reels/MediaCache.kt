@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.intubemedia.reels

import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheKeyFactory
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * 500 MB on-disk video cache. Stream URLs carry a short-lived token, so cache keys are derived
 * from the media path to survive token refreshes and media replacements.
 * Playlists are never cached because they embed tokenised segment URLs.
 */
object MediaCache {
    private const val MAX_BYTES = 500L * 1024 * 1024
    private lateinit var cache: SimpleCache
    private lateinit var upstream: DataSource.Factory
    private data class MediaInfo(val episodeId: String, val isHls: Boolean, val mediaPath: String?)
    private val tokens = ConcurrentHashMap<String, MediaInfo>()

    fun init(context: Context) {
        cache = SimpleCache(
            File(context.cacheDir, "media"),
            LeastRecentlyUsedCacheEvictor(MAX_BYTES),
            StandaloneDatabaseProvider(context),
        )
        upstream = OkHttpDataSource.Factory(Net.client)
    }

    fun register(playbackPath: String, episodeId: String, isHls: Boolean, mediaPath: String?) {
        Uri.parse(playbackPath).lastPathSegment?.let { tokens[it] = MediaInfo(episodeId, isHls, mediaPath) }
    }

    private fun isPlaylist(uri: Uri): Boolean {
        val path = uri.getQueryParameter("path")
        return if (path != null) path.endsWith(".m3u8") else tokens[uri.lastPathSegment]?.isHls ?: true
    }

    private val cacheKeys = CacheKeyFactory { spec ->
        val uri = spec.uri
        uri.getQueryParameter("path")?.let { "media:$it" }
            ?: tokens[uri.lastPathSegment]?.let { info ->
                if (info.isHls) "episode:${info.episodeId}"
                else "media:${info.mediaPath ?: "episode:${info.episodeId}"}"
            }
            ?: uri.toString()
    }

    private val dataSourceFactory = DataSource.Factory {
        val direct = upstream.createDataSource()
        val cached = CacheDataSource.Factory()
            .setCache(cache)
            .setUpstreamDataSourceFactory(upstream)
            .setCacheKeyFactory(cacheKeys)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
            .createDataSource()
        RoutingDataSource(cached, direct, ::isPlaylist)
    }

    fun newPlayer(context: Context): ExoPlayer {
        // Start after ~0.5 s of media so swipes feel instant; HLS lets ABR pick 360p first on slow links.
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(4_000, 20_000, 500, 1_500)
            .build()
        return ExoPlayer.Builder(context)
            .setRenderersFactory(DefaultRenderersFactory(context).setEnableDecoderFallback(true))
            .setLoadControl(loadControl)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
            .build()
    }

    fun mediaItem(ready: Playback.Ready): MediaItem = MediaItem.Builder()
        .setUri(ready.url)
        .setMimeType(if (ready.isHls) MimeTypes.APPLICATION_M3U8 else MimeTypes.VIDEO_MP4)
        .setSubtitleConfigurations(
            ready.subtitles.map { subtitle ->
                MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitle.url))
                    .setMimeType(if (subtitle.format == "srt") MimeTypes.APPLICATION_SUBRIP else MimeTypes.TEXT_VTT)
                    .setLanguage(subtitle.lang)
                    .setLabel(subtitle.label)
                    .build()
            },
        )
        .build()
}

private class RoutingDataSource(
    private val cached: DataSource,
    private val direct: DataSource,
    private val bypassCache: (Uri) -> Boolean,
) : DataSource {
    private var current: DataSource? = null

    override fun addTransferListener(transferListener: TransferListener) {
        cached.addTransferListener(transferListener)
        direct.addTransferListener(transferListener)
    }

    override fun open(dataSpec: DataSpec): Long {
        val source = if (bypassCache(dataSpec.uri)) direct else cached
        current = source
        return source.open(dataSpec)
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int = current!!.read(buffer, offset, length)

    override fun getUri(): Uri? = current?.uri

    override fun getResponseHeaders(): Map<String, List<String>> = current?.responseHeaders ?: emptyMap()

    override fun close() {
        current?.close()
        current = null
    }
}
