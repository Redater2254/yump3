package com.android.yustream

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Feeds the "stage light" effect on the player screen.
 *
 * - extractWaveform: decodes the local audio file with MediaCodec (no
 *   RECORD_AUDIO permission needed) and returns a normalized loudness envelope
 *   plus a low-passed (bass) channel, both sampled at [hz] buckets/second.
 * - extractColors: pulls dominant / vibrant / dark / light colors from the
 *   locally saved cover image.
 */
class LightingModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "Lighting"

    @ReactMethod
    fun extractWaveform(path: String, hz: Int, promise: Promise) {
        Thread {
            try {
                promise.resolve(decodeEnvelope(path, hz.coerceIn(10, 60)))
            } catch (e: Exception) {
                promise.reject("ERR_WAVEFORM", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun extractColors(path: String, promise: Promise) {
        Thread {
            try {
                promise.resolve(extractPalette(path))
            } catch (e: Exception) {
                promise.reject("ERR_COLORS", e.message, e)
            }
        }.start()
    }

    /* ----------------------------- waveform ----------------------------- */

    /** MediaCodec/BitmapFactory need a plain filesystem path, not a file:// URI. */
    private fun localPath(uri: String): String =
        if (uri.startsWith("file://")) Uri.parse(uri).path ?: uri.removePrefix("file://") else uri

    private fun decodeEnvelope(path: String, hz: Int): WritableMap {
        val extractor = MediaExtractor()
        var codec: MediaCodec? = null
        try {
            extractor.setDataSource(localPath(path))

            var trackIndex = -1
            var format: MediaFormat? = null
            for (i in 0 until extractor.trackCount) {
                val candidate = extractor.getTrackFormat(i)
                val mime = candidate.getString(MediaFormat.KEY_MIME) ?: continue
                if (mime.startsWith("audio/")) {
                    trackIndex = i
                    format = candidate
                    break
                }
            }
            if (trackIndex < 0 || format == null) throw IllegalStateException("no audio track")
            extractor.selectTrack(trackIndex)

            val mime = format.getString(MediaFormat.KEY_MIME)!!
            val sampleRate = max(1, format.getInteger(MediaFormat.KEY_SAMPLE_RATE))
            val channels = max(1, format.getInteger(MediaFormat.KEY_CHANNEL_COUNT))
            val pcmFloat = format.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
                format.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT

            codec = MediaCodec.createDecoderByType(mime)
            codec.configure(format, null, null, 0)
            codec.start()

            val bucketFrames = max(1, sampleRate / hz)
            val rawEnergy = ArrayList<Double>(8192)
            val rawLow = ArrayList<Double>(8192)
            var sumSq = 0.0
            var lowSumSq = 0.0
            var framesInBucket = 0
            var lowState = 0.0
            // One-pole low-pass around 150 Hz -> "bass" channel for the halo.
            val alpha = (2.0 * Math.PI * 150.0 / sampleRate).coerceIn(0.0005, 0.3)

            val info = MediaCodec.BufferInfo()
            var inputDone = false
            var outputDone = false

            while (!outputDone) {
                if (!inputDone) {
                    val inIndex = codec.dequeueInputBuffer(10_000)
                    if (inIndex >= 0) {
                        val buffer = codec.getInputBuffer(inIndex)!!
                        val size = extractor.readSampleData(buffer, 0)
                        if (size < 0) {
                            codec.queueInputBuffer(
                                inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM
                            )
                            inputDone = true
                        } else {
                            codec.queueInputBuffer(inIndex, 0, size, extractor.sampleTime, 0)
                            extractor.advance()
                        }
                    }
                }

                val outIndex = codec.dequeueOutputBuffer(info, 10_000)
                if (outIndex >= 0) {
                    if (info.size > 0) {
                        val buffer = codec.getOutputBuffer(outIndex)!!
                        buffer.position(info.offset)
                        buffer.limit(info.offset + info.size)
                        if (pcmFloat) {
                            val samples = buffer.order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
                            val frames = samples.remaining() / channels
                            for (i in 0 until frames) {
                                var mono = 0.0
                                for (c in 0 until channels) mono += samples.get().toDouble()
                                mono /= channels
                                sumSq += mono * mono
                                lowState += alpha * (mono - lowState)
                                lowSumSq += lowState * lowState
                                framesInBucket++
                                if (framesInBucket >= bucketFrames) {
                                    rawEnergy.add(sqrt(sumSq / framesInBucket))
                                    rawLow.add(sqrt(lowSumSq / framesInBucket))
                                    sumSq = 0.0
                                    lowSumSq = 0.0
                                    framesInBucket = 0
                                }
                            }
                        } else {
                            val samples = buffer.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
                            val frames = samples.remaining() / channels
                            for (i in 0 until frames) {
                                var mono = 0.0
                                for (c in 0 until channels) mono += samples.get() / 32768.0
                                mono /= channels
                                sumSq += mono * mono
                                lowState += alpha * (mono - lowState)
                                lowSumSq += lowState * lowState
                                framesInBucket++
                                if (framesInBucket >= bucketFrames) {
                                    rawEnergy.add(sqrt(sumSq / framesInBucket))
                                    rawLow.add(sqrt(lowSumSq / framesInBucket))
                                    sumSq = 0.0
                                    lowSumSq = 0.0
                                    framesInBucket = 0
                                }
                            }
                        }
                    }
                    codec.releaseOutputBuffer(outIndex, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        outputDone = true
                    }
                }
            }

            val map = Arguments.createMap()
            map.putInt("hz", hz)
            map.putDouble("duration", rawEnergy.size.toDouble() / hz)
            map.putArray("energy", normalize(rawEnergy))
            map.putArray("low", normalize(rawLow))
            return map
        } finally {
            try {
                codec?.stop()
            } catch (_: Exception) {
            }
            try {
                codec?.release()
            } catch (_: Exception) {
            }
            extractor.release()
        }
    }

    /** Scales raw RMS values to 0..255 using a perceptual curve and the 98th percentile peak. */
    private fun normalize(raw: ArrayList<Double>): WritableArray {
        val out = Arguments.createArray()
        if (raw.isEmpty()) return out
        val sorted = raw.sorted()
        val peakIndex = min(sorted.size - 1, (sorted.size * 0.98).toInt())
        val peak = max(1e-6, sorted[peakIndex])
        for (value in raw) {
            val normalized = sqrt(min(1.0, value / peak))
            out.pushInt((normalized * 255.0).toInt().coerceIn(0, 255))
        }
        return out
    }

    /* ------------------------------ palette ----------------------------- */

    private fun extractPalette(path: String): WritableMap {
        val file = localPath(path)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            throw IllegalStateException("bad image")
        }
        var sample = 1
        while (min(bounds.outWidth, bounds.outHeight) / sample > 128) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val bitmap = BitmapFactory.decodeFile(file, options)
            ?: throw IllegalStateException("decode failed")
        try {
            return quantize(bitmap)
        } finally {
            bitmap.recycle()
        }
    }

    private class Bin {
        var count = 0
        var r = 0L
        var g = 0L
        var b = 0L
    }

    private data class Cand(
        val r: Int,
        val g: Int,
        val b: Int,
        val count: Int,
        val lum: Double,
        val sat: Double
    )

    private fun quantize(bitmap: Bitmap): WritableMap {
        val bins = HashMap<Int, Bin>()
        val stepX = max(1, bitmap.width / 96)
        val stepY = max(1, bitmap.height / 96)
        var y = 0
        while (y < bitmap.height) {
            var x = 0
            while (x < bitmap.width) {
                val color = bitmap.getPixel(x, y)
                if (Color.alpha(color) > 200) {
                    val r = Color.red(color)
                    val g = Color.green(color)
                    val b = Color.blue(color)
                    val key = (r shr 4 shl 8) or (g shr 4 shl 4) or (b shr 4)
                    val bin = bins.getOrPut(key) { Bin() }
                    bin.count++
                    bin.r += r
                    bin.g += g
                    bin.b += b
                }
                x += stepX
            }
            y += stepY
        }
        if (bins.isEmpty()) throw IllegalStateException("no pixels")

        val candidates = bins.values.map { bin ->
            val r = (bin.r / bin.count).toInt()
            val g = (bin.g / bin.count).toInt()
            val b = (bin.b / bin.count).toInt()
            val maxC = maxOf(r, g, b)
            val minC = minOf(r, g, b)
            val sat = if (maxC == 0) 0.0 else (maxC - minC).toDouble() / maxC
            val lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            Cand(r, g, b, bin.count, lum, sat)
        }

        val dominant = candidates
            .filter { it.sat > 0.12 && it.lum > 28 && it.lum < 225 }
            .maxByOrNull { it.count }
            ?: candidates.maxByOrNull { it.count }!!
        val vibrant = candidates
            .filter { it.sat > 0.22 && it.lum > 34 && it.lum < 228 }
            .maxByOrNull { it.count * it.sat * it.sat * (1.0 - abs(it.lum - 150.0) / 220.0) }
            ?: dominant
        val dark = candidates.filter { it.lum < 90 }.maxByOrNull { it.count } ?: dominant
        val light = candidates.filter { it.lum > 150 }.maxByOrNull { it.count } ?: dominant

        val result = Arguments.createMap()
        result.putString("dominant", toHex(dominant.r, dominant.g, dominant.b))
        result.putString("vibrant", toHex(boost(vibrant)))
        result.putString("dark", toHex(scale(dark, 0.55)))
        result.putString("light", toHex(lighten(light)))
        return result
    }

    private fun boost(c: Cand): Triple<Int, Int, Int> {
        val hsv = FloatArray(3)
        Color.RGBToHSV(c.r, c.g, c.b, hsv)
        hsv[1] = max(hsv[1], 0.55f)
        hsv[2] = min(max(hsv[2], 0.62f), 0.95f)
        val color = Color.HSVToColor(hsv)
        return Triple(Color.red(color), Color.green(color), Color.blue(color))
    }

    private fun scale(c: Cand, factor: Double): Triple<Int, Int, Int> =
        Triple(
            (c.r * factor).toInt(),
            (c.g * factor).toInt(),
            (c.b * factor).toInt()
        )

    private fun lighten(c: Cand): Triple<Int, Int, Int> =
        Triple(
            c.r + ((255 - c.r) * 0.35).toInt(),
            c.g + ((255 - c.g) * 0.35).toInt(),
            c.b + ((255 - c.b) * 0.35).toInt()
        )

    private fun toHex(c: Triple<Int, Int, Int>): String = toHex(c.first, c.second, c.third)

    private fun toHex(r: Int, g: Int, b: Int): String = String.format(
        "#%02X%02X%02X",
        r.coerceIn(0, 255),
        g.coerceIn(0, 255),
        b.coerceIn(0, 255)
    )
}
