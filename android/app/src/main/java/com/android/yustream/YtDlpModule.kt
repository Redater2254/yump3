package com.android.yustream

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest

/**
 * Exposes the bundled yt-dlp + ffmpeg to JS so yump3 can search YouTube and
 * download/convert audio entirely on-device (no middle server).
 */
class YtDlpModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "YtDlp"

    private fun ensureInit() {
        if (initialized) return
        YoutubeDL.getInstance().init(reactApplicationContext)
        FFmpeg.getInstance().init(reactApplicationContext)
        initialized = true
    }

    private fun emitProgress(id: String, progress: Float, etaInSeconds: Long, line: String?) {
        val map = Arguments.createMap()
        map.putString("id", id)
        map.putDouble("progress", progress.toDouble())
        map.putDouble("eta", etaInSeconds.toDouble())
        map.putString("line", line)
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("YtDlpProgress", map)
    }

    @ReactMethod
    fun init(promise: Promise) {
        try {
            ensureInit()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_INIT", e.message, e)
        }
    }

    /** yt-dlp ytsearch -> raw JSON string (playlist with entries). */
    @ReactMethod
    fun search(query: String, limit: Int, promise: Promise) {
        Thread {
            try {
                ensureInit()
                val request = YoutubeDLRequest("ytsearch$limit:$query")
                request.addOption("--dump-single-json")
                request.addOption("--skip-download")
                request.addOption("--no-playlist")
                request.addOption("--flat-playlist")
                // Explicit args to disambiguate the two execute() overloads.
                val response = YoutubeDL.getInstance().execute(request, null, null)
                promise.resolve(response.out)
            } catch (e: Exception) {
                promise.reject("ERR_SEARCH", e.message, e)
            }
        }.start()
    }

    /**
     * Deep search for album-art ("Topic") tracks. Unlike [search] this extracts
     * every candidate (slower) and keeps only entries carrying artist/album/track
     * music metadata, which rules out MVs, lyric videos and covers.
     * One JSON object per line (--dump-json); note that --dump-single-json
     * silently ignores --match-filter.
     */
    @ReactMethod
    fun searchArtTracks(query: String, limit: Int, promise: Promise) {
        Thread {
            try {
                ensureInit()
                val request = YoutubeDLRequest("ytsearch$limit:$query")
                request.addOption("--dump-json")
                request.addOption("--skip-download")
                request.addOption("--no-playlist")
                request.addOption("--match-filter", "artist & album & track")
                request.addOption("--force-ipv4")
                request.addOption("--socket-timeout", "20")
                request.addOption("--extractor-retries", "3")
                // Explicit args to disambiguate the two execute() overloads.
                val response = YoutubeDL.getInstance().execute(request, null, null)
                promise.resolve(response.out)
            } catch (e: Exception) {
                promise.reject("ERR_SEARCH_ART", e.message, e)
            }
        }.start()
    }

    /** Download + transcode to mp3 with embedded thumbnail & tags. */
    @ReactMethod
    fun download(url: String, outputDir: String, processId: String, audioQuality: String, promise: Promise) {
        Thread {
            try {
                ensureInit()
                val request = YoutubeDLRequest(url)
                request.addOption("-x")
                request.addOption("--audio-format", "mp3")
                request.addOption("--audio-quality", audioQuality.ifBlank { "0" })
                request.addOption("--embed-thumbnail")
                request.addOption("--convert-thumbnails", "jpg")
                request.addOption("--write-thumbnail")
                request.addOption("--add-metadata")
                request.addOption("--embed-metadata")
                request.addOption("--windows-filenames")
                request.addOption("--trim-filenames", "150")
                request.addOption("--no-mtime")
                request.addOption("--no-playlist")
                request.addOption("--retries", "5")
                request.addOption("--fragment-retries", "5")
                request.addOption("--extractor-retries", "10")
                request.addOption("--socket-timeout", "20")
                request.addOption("--force-ipv4")
                request.addOption("--sleep-requests", "1")
                request.addOption("--no-simulate")
                request.addOption("--print", "%(duration)s")
                request.addOption("-o", "$outputDir/%(title)s [%(id)s].%(ext)s")
                val response = YoutubeDL.getInstance().execute(request, processId) { progress, etaInSeconds, line ->
                    emitProgress(processId, progress, etaInSeconds, line)
                }
                promise.resolve(response.out)
            } catch (e: Exception) {
                promise.reject("ERR_DOWNLOAD", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun cancel(processId: String, promise: Promise) {
        try {
            YoutubeDL.getInstance().destroyProcessById(processId)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_CANCEL", e.message, e)
        }
    }

    @ReactMethod
    fun update(promise: Promise) {
        Thread {
            try {
                ensureInit()
                val status = YoutubeDL.getInstance()
                    .updateYoutubeDL(reactApplicationContext, YoutubeDL.UpdateChannel.STABLE)
                // "DONE" | "ALREADY_UP_TO_DATE"
                promise.resolve(status?.name ?: "DONE")
            } catch (e: Exception) {
                promise.reject("ERR_UPDATE", e.message, e)
            }
        }.start()
    }

    /** Playlist metadata (flat) -> raw JSON string (includes title + entries). */
    @ReactMethod
    fun playlistInfo(url: String, limit: Int, promise: Promise) {
        Thread {
            try {
                ensureInit()
                val request = YoutubeDLRequest(url)
                request.addOption("--dump-single-json")
                request.addOption("--skip-download")
                request.addOption("--flat-playlist")
                request.addOption("--playlist-end", limit.toString())
                val response = YoutubeDL.getInstance().execute(request, null, null)
                promise.resolve(response.out)
            } catch (e: Exception) {
                promise.reject("ERR_PLAYLIST", e.message, e)
            }
        }.start()
    }

    /** Current yt-dlp version string, e.g. "2025.09.05". */
    @ReactMethod
    fun getVersion(promise: Promise) {
        Thread {
            try {
                ensureInit()
                promise.resolve(YoutubeDL.getInstance().version(reactApplicationContext))
            } catch (e: Exception) {
                promise.reject("ERR_VERSION", e.message, e)
            }
        }.start()
    }

    /**
     * Integrity check: actually runs `yt-dlp --version` so a broken/corrupt
     * extraction is detected instead of failing later during a download.
     */
    @ReactMethod
    fun selfCheck(promise: Promise) {
        Thread {
            try {
                ensureInit()
                val request = YoutubeDLRequest("--version")
                val response = YoutubeDL.getInstance().execute(request, null, null)
                val version = response.out.trim()
                if (version.isEmpty()) {
                    promise.reject("ERR_SELFCHECK", "yt-dlp returned an empty version")
                } else {
                    promise.resolve(version)
                }
            } catch (e: Exception) {
                promise.reject("ERR_SELFCHECK", e.message, e)
            }
        }.start()
    }

    // Required stubs so NativeEventEmitter doesn't warn on Android.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    companion object {
        @Volatile
        private var initialized = false
    }
}
