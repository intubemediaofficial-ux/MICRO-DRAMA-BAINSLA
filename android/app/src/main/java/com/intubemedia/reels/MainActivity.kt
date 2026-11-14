package com.intubemedia.reels

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** App-wide scope for fire-and-forget calls (progress saves) that must outlive a screen. */
val AppScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

object AppState {
    /** Bumped on login/logout so screens reload entitlement-dependent data. */
    var authVersion by mutableIntStateOf(0)
}

private val colors = darkColorScheme(
    primary = Color(0xFFE50914),
    onPrimary = Color.White,
    background = Color(0xFF0B0B0F),
    surface = Color(0xFF15151C),
    surfaceVariant = Color(0xFF22222C),
)

class MainActivity : ComponentActivity() {
    private var inboundLink by mutableStateOf<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        inboundLink = intent?.data
        setContent { MaterialTheme(colorScheme = colors) { ReelsNav(::openWeb, inboundLink) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        inboundLink = intent.data
    }

    override fun onStop() {
        super.onStop()
        AppScope.launch { Analytics.flush() }
    }

    private fun openWeb(path: String) {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.BASE_URL + path)))
    }
}

private val tabs = listOf(
    Triple("home", "Home", Icons.Filled.Home),
    Triple("search", "Search", Icons.Filled.Search),
    Triple("account", "Account", Icons.Filled.Person),
)

@Composable
private fun ReelsNav(openWeb: (String) -> Unit, deepLink: Uri?) {
    val nav = rememberNavController()
    val route = nav.currentBackStackEntryAsState().value?.destination?.route
    val play: (String, String, Int) -> Unit = { slug, episodeId, startPositionSec ->
        nav.navigate("play/${Uri.encode(slug)}/$episodeId/$startPositionSec")
    }
    val openSeries: (String) -> Unit = { slug -> nav.navigate("series/${Uri.encode(slug)}") }
    LaunchedEffect(deepLink) {
        val uri = deepLink ?: return@LaunchedEffect
        uri.getQueryParameter("ref")?.takeIf { it.isNotBlank() }?.let { AppPreferences.pendingReferralCode = it }
        when (uri.pathSegments.firstOrNull()) {
            "series" -> uri.pathSegments.getOrNull(1)?.let(openSeries)
            "watch" -> {
                val episodeId = uri.pathSegments.getOrNull(1)
                if (episodeId != null) {
                    val slug = uri.getQueryParameter("seriesSlug")
                        ?: runCatching { Api.resolveSeriesSlug(episodeId) }.getOrNull()
                    if (!slug.isNullOrBlank()) play(slug, episodeId, 0)
                }
            }
        }
    }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            if (tabs.any { it.first == route }) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    tabs.forEach { (tabRoute, label, icon) ->
                        NavigationBarItem(
                            selected = route == tabRoute,
                            onClick = { nav.switchTab(tabRoute) },
                            icon = { Icon(icon, contentDescription = label) },
                            label = { Text(label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = "home", modifier = Modifier.padding(if (route?.startsWith("play/") == true) androidx.compose.foundation.layout.PaddingValues() else padding)) {
            composable("home") { HomeScreen(openSeries, play) }
            composable("search") { SearchScreen(openSeries) }
            composable("account") { AccountScreen(play, openWeb, openSeries) }
            composable("series/{slug}") { entry ->
                SeriesScreen(
                    entry.arguments?.getString("slug").orEmpty(),
                    play,
                    onBack = { nav.popBackStack() },
                    onLogin = { nav.switchTab("account") },
                )
            }
            composable("play/{slug}/{episodeId}/{startPositionSec}") { entry ->
                PlayerScreen(
                    slug = entry.arguments?.getString("slug").orEmpty(),
                    episodeId = entry.arguments?.getString("episodeId").orEmpty(),
                    startPositionSec = entry.arguments?.getString("startPositionSec")?.toIntOrNull() ?: 0,
                    onBack = { nav.popBackStack() },
                    onLogin = { nav.switchTab("account") },
                    openWeb = openWeb,
                )
            }
        }
    }
}

private fun NavHostController.switchTab(route: String) {
    if (route == "home") {
        navigate("home") {
            popUpTo("home") { saveState = true }
            launchSingleTop = true
        }
    } else {
        navigate(route) {
            popUpTo("home") { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }
}
