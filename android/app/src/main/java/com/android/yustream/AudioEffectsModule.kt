package com.android.yustream

import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import android.media.audiofx.Virtualizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Equalizer / bass boost / 3D (virtualizer) / loudness enhancer attached to the
 * player's audio session.
 */
class AudioEffectsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AudioEffects"

    private var equalizer: Equalizer? = null
    private var bassBoost: BassBoost? = null
    private var virtualizer: Virtualizer? = null
    private var loudness: LoudnessEnhancer? = null
    private var attachedSession = -1
    private var enabled = false

    private fun releaseInternal() {
        try {
            equalizer?.release()
        } catch (e: Throwable) {
        }
        try {
            bassBoost?.release()
        } catch (e: Throwable) {
        }
        try {
            virtualizer?.release()
        } catch (e: Throwable) {
        }
        try {
            loudness?.release()
        } catch (e: Throwable) {
        }
        equalizer = null
        bassBoost = null
        virtualizer = null
        loudness = null
        attachedSession = -1
    }

    private fun ensureAttached(): Boolean {
        val session = AudioSessionHolder.sessionId
        if (session == 0) return false
        if (attachedSession == session && equalizer != null) return true
        releaseInternal()
        return try {
            equalizer = Equalizer(0, session)
            bassBoost = BassBoost(0, session)
            virtualizer = Virtualizer(0, session)
            loudness = LoudnessEnhancer(session)
            attachedSession = session
            true
        } catch (e: Throwable) {
            releaseInternal()
            false
        }
    }

    private fun applyEnabledState() {
        val bass = bassBoost?.roundedStrength?.toInt() ?: 0
        val spatial = virtualizer?.roundedStrength?.toInt() ?: 0
        val gain = loudness?.targetGain ?: 0f
        equalizer?.enabled = enabled
        bassBoost?.enabled = enabled && bass > 0
        virtualizer?.enabled = enabled && spatial > 0
        loudness?.enabled = enabled && gain > 0f
    }

    @ReactMethod
    fun getInfo(promise: Promise) {
        try {
            val map = Arguments.createMap()
            map.putInt("sessionId", AudioSessionHolder.sessionId)
            if (!ensureAttached()) {
                map.putBoolean("available", false)
                promise.resolve(map)
                return
            }
            map.putBoolean("available", true)
            map.putBoolean("enabled", enabled)
            val eq = equalizer!!
            map.putInt("numBands", eq.numberOfBands.toInt())
            val range = eq.bandLevelRange
            map.putInt("levelMin", range[0].toInt())
            map.putInt("levelMax", range[1].toInt())
            val bands = Arguments.createArray()
            for (i in 0 until eq.numberOfBands) {
                val band = Arguments.createMap()
                band.putInt("index", i)
                band.putDouble("centerFreq", eq.getCenterFreq(i.toShort()) / 1000.0)
                band.putInt("level", eq.getBandLevel(i.toShort()).toInt())
                bands.pushMap(band)
            }
            map.putArray("bands", bands)
            val presets = Arguments.createArray()
            for (i in 0 until eq.numberOfPresets) {
                val preset = Arguments.createMap()
                preset.putInt("index", i)
                preset.putString("name", eq.getPresetName(i.toShort()))
                presets.pushMap(preset)
            }
            map.putArray("presets", presets)
            map.putInt("bassStrength", bassBoost?.roundedStrength?.toInt() ?: 0)
            map.putInt("virtualizerStrength", virtualizer?.roundedStrength?.toInt() ?: 0)
            map.putInt("loudnessGain", (loudness?.targetGain ?: 0f).toInt())
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("ERR_EQ_INFO", e.message, e)
        }
    }

    @ReactMethod
    fun setEnabled(value: Boolean, promise: Promise) {
        try {
            enabled = value
            if (!ensureAttached()) {
                promise.resolve(false)
                return
            }
            applyEnabledState()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_EQ_ENABLE", e.message, e)
        }
    }

    @ReactMethod
    fun setBandLevel(band: Int, level: Int, promise: Promise) {
        try {
            ensureAttached()
            equalizer?.setBandLevel(band.toShort(), level.toShort())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_EQ_BAND", e.message, e)
        }
    }

    @ReactMethod
    fun setPreset(index: Int, promise: Promise) {
        try {
            ensureAttached()
            equalizer?.usePreset(index.toShort())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_EQ_PRESET", e.message, e)
        }
    }

    @ReactMethod
    fun setBassBoost(strength: Int, promise: Promise) {
        try {
            ensureAttached()
            bassBoost?.setStrength(strength.coerceIn(0, 1000).toShort())
            applyEnabledState()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_BASS", e.message, e)
        }
    }

    @ReactMethod
    fun setVirtualizer(strength: Int, promise: Promise) {
        try {
            ensureAttached()
            virtualizer?.setStrength(strength.coerceIn(0, 1000).toShort())
            applyEnabledState()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_3D", e.message, e)
        }
    }

    @ReactMethod
    fun setLoudness(gainMb: Int, promise: Promise) {
        try {
            ensureAttached()
            loudness?.setTargetGain(gainMb.coerceIn(0, 2000))
            applyEnabledState()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_LOUDNESS", e.message, e)
        }
    }

    @ReactMethod
    fun release(promise: Promise) {
        try {
            enabled = false
            releaseInternal()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_EQ_RELEASE", e.message, e)
        }
    }
}
