package com.android.yustream

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Background APK download for in-app updates, using the system DownloadManager
 * so the download keeps running (with a progress notification) even when the
 * app is in the background or closed.
 */
class ApkUpdaterModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ApkUpdater"

    private fun manager(context: Context): DownloadManager =
        context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

    @ReactMethod
    fun startDownload(url: String, fileName: String, title: String, description: String, promise: Promise) {
        try {
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle(title)
                .setDescription(description)
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)
                .setDestinationInExternalFilesDir(
                    reactApplicationContext,
                    Environment.DIRECTORY_DOWNLOADS,
                    fileName
                )
            val id = manager(reactApplicationContext).enqueue(request)
            promise.resolve(id.toDouble())
        } catch (e: Exception) {
            promise.reject("ERR_UPDATE_DL", e.message, e)
        }
    }

    @ReactMethod
    fun query(downloadId: Double, promise: Promise) {
        try {
            val cursor = manager(reactApplicationContext)
                .query(DownloadManager.Query().setFilterById(downloadId.toLong()))
            val map = Arguments.createMap()
            if (cursor != null && cursor.moveToFirst()) {
                fun idx(column: String) = cursor.getColumnIndex(column)
                map.putInt("status", cursor.getInt(idx(DownloadManager.COLUMN_STATUS)))
                map.putDouble(
                    "downloaded",
                    cursor.getLong(idx(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)).toDouble()
                )
                map.putDouble("total", cursor.getLong(idx(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)).toDouble())
                map.putInt("reason", cursor.getInt(idx(DownloadManager.COLUMN_REASON)))
                map.putString("localUri", cursor.getString(idx(DownloadManager.COLUMN_LOCAL_URI)))
            }
            cursor?.close()
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("ERR_UPDATE_QUERY", e.message, e)
        }
    }

    /** Opens the system installer for a finished DownloadManager download. */
    @ReactMethod
    fun install(downloadId: Double, promise: Promise) {
        try {
            val uri = manager(reactApplicationContext).getUriForDownloadedFile(downloadId.toLong())
                ?: return promise.reject("ERR_UPDATE_INSTALL", "downloaded file not found")
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_UPDATE_INSTALL", e.message, e)
        }
    }

    @ReactMethod
    fun remove(downloadId: Double, promise: Promise) {
        try {
            manager(reactApplicationContext).remove(downloadId.toLong())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_UPDATE_REMOVE", e.message, e)
        }
    }
}
