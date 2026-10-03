package com.android.yustream

import com.doublesymmetry.trackplayer.service.MusicService

/**
 * Reads the audio session id that the patched RNTP MusicService assigns to its
 * ExoPlayer instance, so in-app audio effects can attach to it.
 */
object AudioSessionHolder {
    val sessionId: Int
        get() = try {
            MusicService.audioSessionId
        } catch (e: Throwable) {
            0
        }
}
