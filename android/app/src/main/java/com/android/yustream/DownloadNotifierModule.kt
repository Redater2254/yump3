package com.android.yustream

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Shows/updates the music-download progress notification. */
class DownloadNotifierModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DownloadNotifier"

    private fun serviceIntent(title: String, sub: String, progress: Int) =
        Intent(reactApplicationContext, DownloadService::class.java).apply {
            putExtra(DownloadService.EXTRA_TITLE, title)
            putExtra(DownloadService.EXTRA_SUB, sub)
            putExtra(DownloadService.EXTRA_PROGRESS, progress)
        }

    @ReactMethod
    fun start(title: String, sub: String, progress: Int, promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(serviceIntent(title, sub, progress))
            } else {
                reactApplicationContext.startService(serviceIntent(title, sub, progress))
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_NOTIF_START", e.message, e)
        }
    }

    @ReactMethod
    fun update(title: String, sub: String, progress: Int, promise: Promise) {
        try {
            val manager =
                reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(
                DownloadService.NOTIFICATION_ID,
                DownloadService.buildNotification(reactApplicationContext, title, sub, progress)
            )
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_NOTIF_UPDATE", e.message, e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            reactApplicationContext.stopService(
                Intent(reactApplicationContext, DownloadService::class.java)
            )
            val manager =
                reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.cancel(DownloadService.NOTIFICATION_ID)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_NOTIF_STOP", e.message, e)
        }
    }
}
