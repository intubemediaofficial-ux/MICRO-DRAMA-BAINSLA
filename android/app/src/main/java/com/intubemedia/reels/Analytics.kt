package com.intubemedia.reels

import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject

object Analytics {
    private data class Event(
        val name: String,
        val seriesId: String?,
        val episodeId: String?,
        val positionSec: Int?,
        val props: JSONObject?,
    )

    private val queue = ArrayDeque<Event>()
    private val mutex = Mutex()
    private var started = false

    fun start() {
        if (started) return
        started = true
        track("app_open")
        AppScope.launch {
            while (true) {
                delay(30_000)
                flush()
            }
        }
    }

    @Synchronized
    fun track(
        name: String,
        seriesId: String? = null,
        episodeId: String? = null,
        positionSec: Int? = null,
        props: JSONObject? = null,
    ) {
        if (queue.size >= 200) queue.removeFirst()
        queue.addLast(Event(name, seriesId, episodeId, positionSec, props))
    }

    private fun requeueAtFront(events: List<Event>) = synchronized(this) {
        events.asReversed().forEach(queue::addFirst)
        while (queue.size > 200) queue.removeLast()
    }

    suspend fun flush() = mutex.withLock {
        val batch = synchronized(this) {
            if (queue.isEmpty()) return@withLock
            buildList { while (queue.isNotEmpty()) add(queue.removeFirst()) }
        }
        val chunks = batch.chunked(50)
        for (index in chunks.indices) {
            val events = chunks[index]
            val body = JSONObject()
                .put("deviceId", AppPreferences.deviceId)
                .put("events", JSONArray().apply {
                    events.forEach { event ->
                        put(JSONObject().put("name", event.name).apply {
                            event.seriesId?.let { put("seriesId", it) }
                            event.episodeId?.let { put("episodeId", it) }
                            event.positionSec?.let { put("positionSec", it) }
                            event.props?.let { put("props", it) }
                        })
                    }
                })
            if (runCatching { Net.post("/api/events", body) }.isFailure) {
                requeueAtFront(chunks.drop(index).flatten())
                return@withLock
            }
        }
    }
}
