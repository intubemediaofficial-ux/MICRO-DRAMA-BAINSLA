package com.intubemedia.reels

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import android.widget.Toast

private val Muted = Color.White.copy(alpha = 0.65f)

@Composable
private fun Loading() = Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }

@Composable
private fun ErrorRetry(message: String, onRetry: () -> Unit) = Column(
    Modifier.fillMaxSize().padding(24.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
) {
    Text(message, color = Color.White)
    Spacer(Modifier.height(12.dp))
    Button(onClick = onRetry) { Text("Retry") }
}

@Composable
private fun Poster(card: SeriesCard, width: androidx.compose.ui.unit.Dp?, onClick: () -> Unit) {
    Column(Modifier.then(if (width != null) Modifier.width(width) else Modifier).clickable(onClick = onClick)) {
        AsyncImage(
            model = card.posterUrl,
            contentDescription = card.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().aspectRatio(2f / 3f).clip(RoundedCornerShape(10.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        )
        Text(
            card.title,
            color = Color.White,
            fontSize = 13.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 6.dp),
        )
    }
}

@Composable
fun HomeScreen(openSeries: (String) -> Unit, play: (String, String, Int) -> Unit) {
    var feed by remember { mutableStateOf<HomeFeed?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableStateOf(0) }
    LaunchedEffect(attempt, AppState.authVersion) {
        error = null
        runCatching { Api.home() }.onSuccess { feed = it }.onFailure { error = "Check your internet connection" }
    }
    val data = feed
    when {
        data != null -> LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
            item {
                Text(
                    "Intube Reels",
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Black,
                    fontSize = 24.sp,
                    modifier = Modifier.statusBarsPadding().padding(16.dp),
                )
            }
            if (data.continueWatching.isNotEmpty()) {
                item {
                    Column(Modifier.padding(top = 8.dp)) {
                        Text(
                            "Continue Watching",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp,
                            modifier = Modifier.padding(horizontal = 16.dp),
                        )
                        Spacer(Modifier.height(10.dp))
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 16.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            items(data.continueWatching, key = { it.episodeId }) { item ->
                                Column(
                                    Modifier.width(120.dp).clickable {
                                        play(item.series.slug, item.episodeId, item.positionSec)
                                    },
                                ) {
                                    AsyncImage(
                                        item.series.posterUrl,
                                        item.series.title,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxWidth().aspectRatio(2f / 3f)
                                            .clip(RoundedCornerShape(10.dp)),
                                    )
                                    Text(
                                        item.series.title,
                                        color = Color.White,
                                        fontSize = 13.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text("EP ${item.episodeNumber}", color = Muted, fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            }
            item {
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(data.hero.distinctBy { it.slug }, key = { it.slug }) { card ->
                        Box(Modifier.width(260.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(16.dp)).clickable { openSeries(card.slug) }) {
                            AsyncImage(card.posterUrl, card.title, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                            Column(
                                Modifier.align(Alignment.BottomStart).fillMaxWidth()
                                    .background(Color.Black.copy(alpha = 0.55f)).padding(14.dp),
                            ) {
                                Text(card.title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                                Text(card.genres.joinToString(" · "), color = Muted, fontSize = 12.sp, maxLines = 1)
                                card.firstEpisodeId?.let { first ->
                                    Spacer(Modifier.height(8.dp))
                                    Button(onClick = { play(card.slug, first, 0) }) {
                                        Icon(Icons.Filled.PlayArrow, contentDescription = null)
                                        Text("Play")
                                    }
                                }
                            }
                        }
                    }
                }
            }
            items(data.rails.filter { it.items.size > 1 }, key = { it.title }) { rail ->
                Column(Modifier.padding(top = 20.dp)) {
                    Text(rail.title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp, modifier = Modifier.padding(horizontal = 16.dp))
                    Spacer(Modifier.height(10.dp))
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(rail.items.distinctBy { it.slug }, key = { it.slug }) { card -> Poster(card, 120.dp) { openSeries(card.slug) } }
                    }
                }
            }
        }
        error != null -> ErrorRetry(error!!) { attempt++ }
        else -> Loading()
    }
}

@Composable
fun SeriesScreen(slug: String, play: (String, String, Int) -> Unit, onBack: () -> Unit) {
    val context = LocalContext.current
    var detail by remember { mutableStateOf<SeriesDetail?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableStateOf(0) }
    var inWatchlist by remember(slug) { mutableStateOf<Boolean?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(slug, attempt, AppState.authVersion) {
        error = null
        runCatching { Api.series(slug) }.onSuccess { detail = it }.onFailure { error = it.message ?: "Could not load" }
    }
    val series = detail
    LaunchedEffect(series?.slug, series?.inWatchlist) {
        inWatchlist = series?.inWatchlist
    }
    when {
        series != null -> LazyVerticalGrid(
            columns = GridCells.Fixed(5),
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(Modifier.statusBarsPadding()) {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White) }
                    Row {
                        AsyncImage(
                            series.posterUrl,
                            series.title,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.width(120.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(10.dp)),
                        )
                        Column(Modifier.padding(start = 14.dp)) {
                            Text(series.title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                            TextButton(onClick = { shareSeries(context, series.title, series.slug) }) { Text("Share") }
                            Text(series.genres.joinToString(" · "), color = Muted, fontSize = 12.sp)
                            Text("${series.episodes.size} episodes", color = Muted, fontSize = 12.sp)
                            Spacer(Modifier.height(10.dp))
                            val next = series.episodes.firstOrNull { !it.watched } ?: series.episodes.firstOrNull()
                            next?.let {
                                Button(onClick = { play(series.slug, it.id, 0) }) {
                                    Icon(Icons.Filled.PlayArrow, contentDescription = null)
                                    Text(if (it.number == 1) "Play EP 1" else "Continue EP ${it.number}")
                                }
                            }
                            if (series.id != null && inWatchlist != null) {
                                Spacer(Modifier.height(6.dp))
                                OutlinedButton(
                                    onClick = {
                                        scope.launch {
                                            val save = inWatchlist != true
                                            runCatching { Api.setWatchlist(series.id, save) }
                                                .onSuccess { inWatchlist = save }
                                                .onFailure { error ->
                                                    if (error is ApiException && error.status == 401) onLogin()
                                                    inWatchlist = null
                                                }
                                        }
                                    },
                                ) {
                                    Text(if (inWatchlist == true) "✓ My List" else "+ My List", color = Color.White)
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(series.synopsis, color = Muted, fontSize = 14.sp)
                    Spacer(Modifier.height(16.dp))
                    Text("Episodes", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
            items(series.episodes, key = { it.id }) { episode ->
                Box(
                    Modifier.aspectRatio(1f).clip(RoundedCornerShape(8.dp))
                        .background(if (episode.watched) Color(0xFF3A1D20) else MaterialTheme.colorScheme.surfaceVariant)
                        .clickable { play(series.slug, episode.id, 0) },
                    contentAlignment = Alignment.Center,
                ) {
                    Text("${episode.number}", color = Color.White, fontWeight = FontWeight.SemiBold)
                    if (episode.locked) {
                        Icon(
                            Icons.Filled.Lock,
                            contentDescription = "Locked",
                            tint = Color(0xFFFFC107),
                            modifier = Modifier.align(Alignment.TopEnd).padding(3.dp).size(12.dp),
                        )
                    }
                }
            }
        }
        error != null -> ErrorRetry(error!!) { attempt++ }
        else -> Loading()
    }
}

@Composable
fun SearchScreen(openSeries: (String) -> Unit) {
    val searchViewModel: SearchViewModel = viewModel()
    val query = searchViewModel.query
    val results = searchViewModel.results
    val searching = searchViewModel.searching
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(16.dp)) {
        OutlinedTextField(
            value = query,
            onValueChange = searchViewModel::onQueryChange,
            placeholder = { Text("Search dramas, genres, cast") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(16.dp))
        if (searching) CircularProgressIndicator()
        else if (query.isNotBlank() && results.isEmpty()) Text("No results", color = Muted)
        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            items(results, key = { it.slug }) { card -> Poster(card, null) { openSeries(card.slug) } }
        }
    }
}

@Composable
fun AccountScreen(
    play: (String, String, Int) -> Unit,
    openWeb: (String) -> Unit,
    openSeries: (String) -> Unit,
) {
    val context = LocalContext.current
    var profile by remember { mutableStateOf<Profile?>(null) }
    var history by remember { mutableStateOf<List<HistoryItem>>(emptyList()) }
    var myList by remember { mutableStateOf<List<SeriesCard>>(emptyList()) }
    var myListAvailable by remember { mutableStateOf(false) }
    var checkin by remember { mutableStateOf<CheckinStatus?>(null) }
    var loaded by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(AppState.authVersion) {
        loaded = false
        profile = runCatching { Api.profile() }.getOrNull()
        history = if (profile != null) runCatching { Api.history() }.getOrDefault(emptyList()) else emptyList()
        val listResult = if (profile != null) runCatching { Api.watchlist() } else null
        myList = listResult?.getOrDefault(emptyList()).orEmpty()
        myListAvailable = listResult?.isSuccess == true
        checkin = if (profile != null) runCatching { Api.checkinStatus() }.getOrNull() else null
        loaded = true
    }
    if (!loaded) return Loading()
    val user = profile ?: return LoginForm { AppState.authVersion++ }
    LazyColumn(Modifier.fillMaxSize().statusBarsPadding(), contentPadding = PaddingValues(16.dp)) {
        item {
            Text(user.email ?: user.phone ?: "My account", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp)
            Spacer(Modifier.height(12.dp))
            Text("Coins: ${user.coins}", color = Color.White)
            if (user.referralCode != null && user.referralLink != null) {
                Spacer(Modifier.height(16.dp))
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Column(Modifier.fillMaxWidth().padding(14.dp)) {
                        Text("Invite friends", color = Color.White, fontWeight = FontWeight.Bold)
                        Text(
                            "Code: ${user.referralCode} · Earn ${user.referralBonusCoins ?: MobileConfigState.current.referralBonusCoins} coins",
                            color = Muted,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                        Button(
                            onClick = { shareText(context, "Join Intube Reels", user.referralLink) },
                            modifier = Modifier.padding(top = 8.dp),
                        ) { Text("Invite") }
                    }
                }
            }
            Text(
                if (user.vipActive) "VIP active – ${user.planName.orEmpty()}" else "No active VIP plan",
                color = if (user.vipActive) Color(0xFFFFC107) else Muted,
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val checkoutEpisode = history.firstOrNull()?.episodeId
                if (user.vipActive || checkoutEpisode != null) {
                    Button(onClick = { openWeb(if (user.vipActive) "/account/subscription" else "/subscribe?episode=$checkoutEpisode") }) {
                        Text(if (user.vipActive) "Manage VIP" else "Get VIP")
                    }
                }
                OutlinedButton(onClick = { scope.launch { Api.logout(); AppState.authVersion++ } }) { Text("Log out", color = Color.White) }
            }
            checkin?.let { status ->
                Spacer(Modifier.height(18.dp))
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Column(Modifier.fillMaxWidth().padding(14.dp)) {
                        Text("Daily check-in", color = Color.White, fontWeight = FontWeight.Bold)
                        Text("Streak: ${status.streak} days · Today: ${status.nextReward} coins", color = Muted, modifier = Modifier.padding(top = 4.dp))
                        Button(
                            enabled = !status.checkedInToday,
                            onClick = {
                                scope.launch {
                                    runCatching { Api.claimCheckin() }.onSuccess { result ->
                                        profile = user.copy(coins = result.optInt("balance", user.coins))
                                        checkin = status.copy(
                                            checkedInToday = true,
                                            streak = result.optInt("streak", status.streak),
                                        )
                                    }.onFailure { error ->
                                        if (error is ApiException && error.status == 409) {
                                            checkin = status.copy(checkedInToday = true)
                                        }
                                    }
                                }
                            },
                            modifier = Modifier.padding(top = 8.dp),
                        ) { Text(if (status.checkedInToday) "Claimed today" else "Claim") }
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
            Text("Continue watching", color = Color.White, fontWeight = FontWeight.Bold)
            if (history.isEmpty()) Text("Nothing yet", color = Muted, modifier = Modifier.padding(top = 8.dp))
        }
        items(history, key = { it.episodeId }) { item ->
            Row(
                Modifier.fillMaxWidth().padding(top = 12.dp).clickable { play(item.seriesSlug, item.episodeId, 0) },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AsyncImage(
                    item.thumbnailUrl,
                    null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.width(56.dp).aspectRatio(9f / 16f).clip(RoundedCornerShape(6.dp)),
                )
                Column(Modifier.padding(start = 12.dp)) {
                    Text(item.seriesTitle, color = Color.White)
                    Text("EP ${item.episodeNumber}", color = Muted, fontSize = 12.sp)
                }
            }
        }
        if (myListAvailable) {
            item {
                Text("My List", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 24.dp))
                if (myList.isEmpty()) Text("No series saved", color = Muted, modifier = Modifier.padding(top = 8.dp))
            }
            items(myList, key = { "saved-${it.slug}" }) { card ->
                Row(
                    Modifier.fillMaxWidth().padding(top = 12.dp).clickable { openSeries(card.slug) },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AsyncImage(
                        card.posterUrl,
                        card.title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.width(56.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(6.dp)),
                    )
                    Text(card.title, color = Color.White, modifier = Modifier.padding(start = 12.dp))
                }
            }
        }
    }
}

@Composable
private fun LoginForm(onLoggedIn: () -> Unit) {
    val context = LocalContext.current
    var identifier by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var codeSent by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun submit(action: suspend () -> Unit) {
        busy = true
        message = null
        scope.launch {
            runCatching { action() }.onFailure { message = it.message }
            busy = false
        }
    }
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Text("Log in", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 24.sp)
        Text("We'll send a 6-digit code to your phone or email.", color = Muted)
        MobileConfigState.current.googleWebClientId?.let { clientId ->
            OutlinedButton(
                enabled = !busy,
                onClick = {
                    busy = true
                    scope.launch {
                        try {
                            val option = GetGoogleIdOption.Builder()
                                .setServerClientId(clientId)
                                .setFilterByAuthorizedAccounts(false)
                                .build()
                            val request = GetCredentialRequest.Builder()
                                .addCredentialOption(option)
                                .build()
                            val credential = CredentialManager.create(context)
                                .getCredential(context, request).credential
                            if (credential is CustomCredential &&
                                credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                            ) {
                                val token = GoogleIdTokenCredential.createFrom(credential.data).idToken
                                Api.googleLogin(token)
                                onLoggedIn()
                            } else {
                                Toast.makeText(context, "No Google credential available", Toast.LENGTH_SHORT).show()
                            }
                        } catch (_: GetCredentialCancellationException) {
                            Toast.makeText(context, "Google sign-in cancelled", Toast.LENGTH_SHORT).show()
                        } catch (_: Exception) {
                            Toast.makeText(context, "Google sign-in unavailable", Toast.LENGTH_SHORT).show()
                        } finally {
                            busy = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            ) { Text("Continue with Google", color = Color.White) }
        }
        Spacer(Modifier.height(20.dp))
        OutlinedTextField(
            value = identifier,
            onValueChange = { identifier = it.trim() },
            label = { Text("Phone or email") },
            singleLine = true,
            enabled = !codeSent,
            modifier = Modifier.fillMaxWidth(),
        )
        if (codeSent) {
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = code,
                onValueChange = { value -> code = value.filter(Char::isDigit).take(6) },
                label = { Text("6-digit code") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Spacer(Modifier.height(16.dp))
        Button(
            enabled = !busy && identifier.length >= 3 && (!codeSent || code.length == 6),
            onClick = {
                if (!codeSent) submit { Api.requestOtp(identifier); codeSent = true }
                else submit { Api.verifyOtp(identifier, code); onLoggedIn() }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (codeSent) "Verify" else "Send code") }
        if (codeSent) {
            OutlinedButton(onClick = { codeSent = false; code = "" }, modifier = Modifier.fillMaxWidth()) {
                Text("Change number / email", color = Color.White)
            }
        }
        message?.let { Text(it, color = Color(0xFFFF8A80), modifier = Modifier.padding(top = 12.dp)) }
    }
}
