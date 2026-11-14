package com.intubemedia.reels

import android.net.Uri
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

data class Rail(val title: String, val items: List<SeriesCard>)
data class HomeFeed(val hero: List<SeriesCard>, val rails: List<Rail>)

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
)

sealed interface Playback {
    data class Ready(val url: String, val isHls: Boolean, val resumeSec: Int) : Playback
    data class Locked(val needsLogin: Boolean, val coinPrice: Int) : Playback
    data class Failed(val message: String) : Playback
}

private fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }
private fun JSONArray?.strings() = this?.let { array -> (0 until array.length()).map { array.getString(it) } } ?: emptyList()
private fun JSONObject.str(name: String) = if (isNull(name)) null else optString(name)

private fun card(json: JSONObject) = SeriesCard(
    slug = json.getString("slug"),
    title = json.getString("title"),
    synopsis = json.optString("synopsis"),
    posterUrl = Net.absolute(json.str("posterUrl")),
    genres = json.optJSONArray("genres").strings(),
    firstEpisodeId = json.str("firstEpisodeId"),
)

object Api {
    suspend fun home(): HomeFeed {
        val json = Net.get("/api/mobile/home")
        return HomeFeed(
            hero = json.getJSONArray("hero").objects().map(::card),
            rails = json.getJSONArray("rails").objects().map { rail ->
                Rail(rail.getString("title"), rail.getJSONArray("items").objects().map(::card))
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
        Playback.Ready(Net.absolute(url)!!, isHls, json.optInt("resumePositionSec"))
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
