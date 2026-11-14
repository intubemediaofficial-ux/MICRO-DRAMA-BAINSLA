package com.intubemedia.reels

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Keeps the website's `microdrama_session` cookie across app restarts. */
class PersistentCookieJar(private val prefs: SharedPreferences) : CookieJar {
    private val cookies = mutableMapOf<String, Cookie>()
    private val baseUrl = BuildConfig.BASE_URL.toHttpUrl()

    init {
        prefs.getStringSet(KEY, emptySet())!!.forEach { raw ->
            Cookie.parse(baseUrl, raw)?.let { cookies[it.name] = it }
        }
    }

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        cookies.forEach { cookie ->
            if (cookie.expiresAt <= System.currentTimeMillis()) this.cookies.remove(cookie.name)
            else this.cookies[cookie.name] = cookie
        }
        persist()
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        cookies.values.removeAll { it.expiresAt <= now }
        return cookies.values.filter { it.matches(url) }
    }

    @Synchronized
    fun clear() {
        cookies.clear()
        persist()
    }

    private fun persist() {
        prefs.edit().putStringSet(KEY, cookies.values.filter { it.persistent }.map { it.toString() }.toSet()).apply()
    }

    private companion object {
        const val KEY = "cookies"
    }
}

class ApiException(val status: Int, message: String, val body: JSONObject?) : Exception(message)

object Net {
    lateinit var client: OkHttpClient
        private set
    private lateinit var cookieJar: PersistentCookieJar
    private val json = "application/json".toMediaType()

    fun init(context: Context) {
        cookieJar = PersistentCookieJar(context.getSharedPreferences("session", Context.MODE_PRIVATE))
        client = OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                chain.proceed(
                    chain.request().newBuilder()
                        .header("User-Agent", "IntubeReels-Android/${BuildConfig.VERSION_NAME}")
                        .build(),
                )
            }
            .build()
    }

    fun absolute(path: String?): String? = when {
        path.isNullOrBlank() -> null
        path.startsWith("http") -> path
        else -> BuildConfig.BASE_URL + path
    }

    fun clearSession() = cookieJar.clear()

    suspend fun get(path: String): JSONObject = call(Request.Builder().url(BuildConfig.BASE_URL + path).build())

    suspend fun post(path: String, body: JSONObject = JSONObject()): JSONObject = call(
        Request.Builder()
            .url(BuildConfig.BASE_URL + path)
            .header("Origin", BuildConfig.BASE_URL)
            .post(body.toString().toRequestBody(json))
            .build(),
    )

    private suspend fun call(request: Request): JSONObject = withContext(Dispatchers.IO) {
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            val parsed = runCatching { JSONObject(text) }.getOrNull()
            if (!response.isSuccessful) {
                val message = parsed?.optJSONObject("error")?.optString("message")?.takeIf { it.isNotBlank() }
                    ?: "Request failed (${response.code})"
                throw ApiException(response.code, message, parsed)
            }
            parsed ?: JSONObject()
        }
    }
}
