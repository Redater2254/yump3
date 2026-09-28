package com.android.yustream

import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/** Starts/queries the background APK update download (foreground service). */
class ApkUpdaterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ApkUpdater"

    @ReactMethod
    fun start(url: String, version: String, promise: Promise) {
        try {
            ApkDownloadService.start(reactApplicationContext, url, version)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_UPDATE_DL", e.message, e)
        }
    }

    @ReactMethod
    fun status(promise: Promise) {
        try {
            val map = Arguments.createMap()
            map.putBoolean("running", ApkDownloadService.running)
            map.putInt("progress", ApkDownloadService.progress)
            map.putDouble("downloaded", ApkDownloadService.downloadedBytes.toDouble())
            map.putDouble("total", ApkDownloadService.totalBytes.toDouble())
            map.putString("error", ApkDownloadService.error)
            val path = ApkDownloadService.finishedPath
                ?: File(reactApplicationContext.cacheDir, ApkDownloadService.FILE_NAME)
                    .takeIf { it.exists() }?.absolutePath
            map.putString("path", path)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("ERR_UPDATE_STATUS", e.message, e)
        }
    }

    @ReactMethod
    fun clear(promise: Promise) {
        try {
            ApkDownloadService.clear(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_UPDATE_CLEAR", e.message, e)
        }
    }

    @ReactMethod
    fun install(promise: Promise) {
        try {
            val intent = ApkDownloadService.installIntent(reactApplicationContext)
                ?: return promise.reject("ERR_UPDATE_INSTALL", "downloaded file not found")
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_UPDATE_INSTALL", e.message, e)
        }
    }

    @ReactMethod
    fun cancel(promise: Promise) {
        try {
            ApkDownloadService.cancel(reactApplicationContext)
            val manager =
                reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE)
                    as android.app.NotificationManager
            manager.cancel(ApkDownloadService.NOTIFICATION_ID)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_UPDATE_CANCEL", e.message, e)
        }
    }
}
