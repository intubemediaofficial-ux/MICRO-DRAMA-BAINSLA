package com.intubemedia.reels

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject

data class SeriesCard(
    val slug: String,
    val title: String,
    val synopsis: String,
    val posterUrl: String?,
    val genres: List<String>,
    val firstEpisodeId: String?,
)

data class ContinueWatchingItem(
    val series: SeriesCard,
    val episodeId: String,
    val episodeNumber: Int,
    val positionSec: Int,
    val durationSec: Int,
)

data class Rail(val title: String, val items: List<SeriesCard>)
data class HomeFeed(
    val hero: List<SeriesCard>,
    val rails: List<Rail>,
    val continueWatching: List<ContinueWatchingItem> = emptyList(),
)

data class FirebaseConfig(
    val appId: String,
    val apiKey: String,
    val projectId: String,
    val senderId: String,
)

data class MobileConfig(
    val paymentsEnabled: Boolean = false,
    val adsEnabled: Boolean = false,
    val admobRewardedUnitId: String? = null,
    val googleWebClientId: String? = null,
    val firebase: FirebaseConfig? = null,
    val referralBonusCoins: Int = 50,
    val checkinRewards: List<Int> = listOf(5, 8, 12, 16, 22, 30, 50),
)

object MobileConfigState {
    var current by mutableStateOf(MobileConfig())
        private set

    internal fun update(config: MobileConfig) {
        current = config
    }
}

data class EpisodeItem(
    val id: String,
    val number: Int,
    val title: String,
    val durationSec: Int,
    val coinPrice: Int,
    val watched: Boolean,
    val access: String,
) {
    val locked get() = access == "LOCKED"
}

data class SeriesDetail(
    val slug: String,
    val title: String,
    val synopsis: String,
    val posterUrl: String?,
    val genres: List<String>,
    val episodes: List<EpisodeItem>,
    val id: String? = null,
    val inWatchlist: Boolean? = null,
)

data class HistoryItem(
    val episodeId: String,
    val seriesSlug: String,
    val seriesTitle: String,
    val episodeNumber: Int,
    val thumbnailUrl: String?,
)

data class Profile(
    val email: String?,
    val phone: String?,
    val coins: Int,
    val vipActive: Boolean,
    val planName: String?,
    val accessEndsAt: String?,
    val referralCode: String? = null,
    val referralLink: String? = null,
    val referralBonusCoins: Int? = null,
)

data class CheckinStatus(
    val checkedInToday: Boolean,
    val streak: Int,
    val nextReward: Int,
    val rewards: List<Int>,
)

sealed interface Playback {
    data class Subtitle(val lang: String, val url: String)
    data class Ready(
        val url: String,
        val isHls: Boolean,
        val resumeSec: Int,
        val subtitles: List<Subtitle> = emptyList(),
        val seriesSlug: String? = null,
    ) : Playback
    data class Locked(val needsLogin: Boolean, val coinPrice: Int) : Playback
    data class Failed(val message: String) : Playback
}

private fun JSONArray?.objects() = this?.let { array ->
    (0 until array.length()).mapNotNull { index -> runCatching { array.getJSONObject(index) }.getOrNull() }
} ?: emptyList()
private fun JSONArray?.strings() = this?.let { array -> (0 until array.length()).map { array.getString(it) } } ?: emptyList()
private fun JSONArray?.ints() = this?.let { array -> (0 until array.length()).map { array.optInt(it) } } ?: emptyList()
private fun JSONObject.str(name: String) = if (isNull(name)) null else optString(name).takeIf { it.isNotBlank() }

private fun card(json: JSONObject) = SeriesCard(
    slug = json.getString("slug"),
    title = json.getString("title"),
    synopsis = json.optString("synopsis"),
    posterUrl = Net.absolute(json.str("posterUrl")),
    genres = json.optJSONArray("genres").strings(),
    firstEpisodeId = json.str("firstEpisodeId"),
)

object Api {
    @Volatile
    private var cachedConfig: MobileConfig? = null

    suspend fun config(refresh: Boolean = false): MobileConfig {
        if (!refresh) cachedConfig?.let { return it }
        val config = runCatching {
            val json = Net.get("/api/mobile/config")
            val firebaseJson = json.optJSONObject("firebase")
            val firebase = firebaseJson?.let {
                val appId = it.str("appId")
                val apiKey = it.str("apiKey")
                val projectId = it.str("projectId")
                val senderId = it.str("senderId")
                if (appId != null && apiKey != null && projectId != null && senderId != null) {
                    FirebaseConfig(appId, apiKey, projectId, senderId)
                } else {
                    null
                }
            }
            MobileConfig(
                paymentsEnabled = json.optBoolean("paymentsEnabled"),
                adsEnabled = json.optBoolean("adsEnabled"),
                admobRewardedUnitId = json.str("admobRewardedUnitId"),
                googleWebClientId = json.str("googleWebClientId"),
                firebase = firebase,
                referralBonusCoins = json.optInt("referralBonusCoins", 50),
                checkinRewards = json.optJSONArray("checkinRewards").ints().ifEmpty {
                    MobileConfig().checkinRewards
                },
            )
        }.getOrDefault(MobileConfig())
        cachedConfig = config
        MobileConfigState.update(config)
        return config
    }

    suspend fun home(): HomeFeed {
        val json = Net.get("/api/mobile/home")
        return HomeFeed(
            hero = json.optJSONArray("hero").objects().map(::card),
            rails = json.optJSONArray("rails").objects().map { rail ->
                Rail(
                    rail.optString("title"),
                    rail.optJSONArray("items").objects().map(::card),
                )
            },
            continueWatching = json.optJSONArray("continueWatching").objects().mapNotNull { item ->
                val episodeId = item.str("episodeId") ?: return@mapNotNull null
                ContinueWatchingItem(
                    series = card(item),
                    episodeId = episodeId,
                    episodeNumber = item.optInt("episodeNumber"),
                    positionSec = item.optInt("positionSec"),
                    durationSec = item.optInt("durationSec"),
                )
            },
        )
    }

    suspend fun series(slug: String): SeriesDetail {
        val json = Net.get("/api/mobile/series/${Uri.encode(slug)}")
        return SeriesDetail(
            slug = json.getString("slug"),
            title = json.getString("title"),
            synopsis = json.optString("synopsis"),
            posterUrl = Net.absolute(json.str("posterUrl")),
            genres = json.optJSONArray("genres").strings(),
            episodes = json.getJSONArray("seasons").objects().flatMap { season ->
                season.getJSONArray("episodes").objects().map { episode ->
                    EpisodeItem(
                        id = episode.getString("id"),
                        number = episode.getInt("number"),
                        title = episode.optString("title"),
                        durationSec = episode.optInt("durationSec"),
                        coinPrice = episode.optInt("coinPrice"),
                        watched = episode.optBoolean("watched"),
                        access = episode.optString("access", "LOCKED"),
                    )
                }
            },
            id = json.str("id"),
            inWatchlist = if (json.has("inWatchlist") && !json.isNull("inWatchlist")) {
                json.optBoolean("inWatchlist")
            } else {
                null
            },
        )
    }

    suspend fun search(query: String): List<SeriesCard> =
        Net.get("/api/mobile/search?q=${Uri.encode(query)}").getJSONArray("items").objects().map(::card)

    /** Null when the user is logged out. */
    suspend fun profile(): Profile? = try {
        val json = Net.get("/api/mobile/me")
        val user = json.getJSONObject("user")
        val subscription = json.optJSONObject("subscription")
        Profile(
            email = user.str("email"),
            phone = user.str("phone"),
            coins = user.optInt("coinBalance"),
            vipActive = json.optBoolean("vipActive"),
            planName = subscription?.str("planName"),
            accessEndsAt = subscription?.str("accessEndsAt"),
            referralCode = user.str("referralCode") ?: json.str("referralCode"),
            referralLink = json.str("referralLink"),
            referralBonusCoins = if (json.has("referralBonusCoins")) json.optInt("referralBonusCoins") else null,
        )
    } catch (error: ApiException) {
        if (error.status == 401) null else throw error
    }

    suspend fun history(): List<HistoryItem> = Net.get("/api/mobile/history").getJSONArray("items").objects().map {
        HistoryItem(
            episodeId = it.getString("episodeId"),
            seriesSlug = it.getString("seriesSlug"),
            seriesTitle = it.getString("seriesTitle"),
            episodeNumber = it.optInt("episodeNumber"),
            thumbnailUrl = Net.absolute(it.str("thumbnailUrl")),
        )
    }

    suspend fun playback(episodeId: String): Playback = try {
        val json = Net.get("/api/episodes/$episodeId/playback")
        val url = json.getString("playbackUrl")
        val isHls = json.optBoolean("isHls")
        MediaCache.register(url, episodeId, isHls)
        Playback.Ready(
            Net.absolute(url)!!,
            isHls,
            json.optInt("resumePositionSec"),
            json.optJSONArray("subtitles").objects().mapNotNull { subtitle ->
                val lang = subtitle.str("lang") ?: return@mapNotNull null
                val subtitleUrl = Net.absolute(subtitle.str("url")) ?: return@mapNotNull null
                Playback.Subtitle(lang, subtitleUrl)
            },
            json.str("seriesSlug"),
        )
    } catch (error: ApiException) {
        when (error.status) {
            401 -> Playback.Locked(needsLogin = true, coinPrice = 0)
            403 -> Playback.Locked(needsLogin = false, coinPrice = error.body?.optInt("coinPrice") ?: 0)
            else -> Playback.Failed(error.message ?: "Playback failed")
        }
    } catch (error: Exception) {
        Playback.Failed("Check your internet connection")
    }

    suspend fun unlockWithCoins(episodeId: String) {
        Net.post("/api/unlocks", JSONObject().put("episodeId", episodeId).put("source", "coin"))
    }

    suspend fun saveProgress(episodeId: String, positionSec: Int, completed: Boolean) {
        runCatching {
            Net.post(
                "/api/progress",
                JSONObject().put("episodeId", episodeId).put("positionSec", positionSec).put("completed", completed),
            )
        }
    }

    suspend fun requestOtp(identifier: String) {
        Net.post("/api/auth/request", JSONObject().put("identifier", identifier))
    }

    suspend fun verifyOtp(identifier: String, code: String) {
        Net.post("/api/auth/verify", JSONObject().put("identifier", identifier).put("code", code))
    }

    suspend fun logout() {
        runCatching { Net.post("/api/auth/logout") }
        Net.clearSession()
    }
}
