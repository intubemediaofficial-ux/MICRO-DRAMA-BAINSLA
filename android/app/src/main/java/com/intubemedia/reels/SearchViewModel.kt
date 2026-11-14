package com.intubemedia.reels

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch

class SearchViewModel : ViewModel() {
    var query by mutableStateOf("")
        private set
    var results by mutableStateOf<List<SeriesCard>>(emptyList())
        private set
    var searching by mutableStateOf(false)
        private set

    private var searchJob: Job? = null

    fun onQueryChange(value: String) {
        query = value.take(80)
        searchJob?.cancel()
        if (query.isBlank()) {
            results = emptyList()
            searching = false
            return
        }
        searching = false
        val q = query
        searchJob = viewModelScope.launch {
            delay(300)
            searching = true
            val newResults = runCatching { Api.search(q.trim()) }.getOrDefault(emptyList())
            currentCoroutineContext().ensureActive()
            results = newResults
            searching = false
        }
    }
}
