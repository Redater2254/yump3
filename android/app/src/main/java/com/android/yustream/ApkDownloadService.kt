package com.android.yustream

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Environment
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Downloads an APK update in a foreground service so it keeps running in the
 * background with a progress notification. Tapping the finished notification
 * opens the system installer.
 */
class ApkDownloadService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) {
                val power = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "yump3:update")
                wakeLock?.setReferenceCounted(false)
            }
            if (wakeLock?.isHeld != true) {
                wakeLock?.acquire(2 * 60 * 60 * 1000L)
            }
        } catch (e: Exception) {
            // ignore
        }
    }

    override fun onDestroy() {
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (e: Exception) {
            // ignore
        }
        wakeLock = null
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_CANCEL) {
            cancelRequested = true
            stopSelf()
            return START_NOT_STICKY
        }
        val url = intent?.getStringExtra(EXTRA_URL) ?: return START_NOT_STICKY
        val version = intent?.getStringExtra(EXTRA_VERSION) ?: ""
        if (running) return START_NOT_STICKY

        running = true
        error = null
        progress = -1
        downloadedBytes = 0L
        totalBytes = 0L
        finishedPath = null
        acquireWakeLock()
        notify(this, buildNotification(this, "yump3 업데이트", "${version} 다운로드 준비 중...", -1, false))

        Thread {
            val dest = File(cacheDir, FILE_NAME)
            try {
                if (dest.exists()) dest.delete()
                val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = true
                    connectTimeout = 20000
                    readTimeout = 30000
                    setRequestProperty(
                        "User-Agent",
                        "Mozilla/5.0 (Linux; Android 14) yump3-updater"
                    )
                }
                connection.connect()
                val code = connection.responseCode
                if (code !in 200..299) throw IOException("HTTP $code")
                totalBytes = connection.contentLengthLong
                connection.inputStream.use { input ->
                    FileOutputStream(dest).use { output ->
                        val buffer = ByteArray(64 * 1024)
                        var read: Int
                        var total = 0L
                        while (input.read(buffer).also { read = it } > 0) {
                            if (cancelRequested) throw IOException("canceled")
                            output.write(buffer, 0, read)
                            total += read
                            downloadedBytes = total
                            val percent =
                                if (totalBytes > 0) ((total * 100) / totalBytes).toInt() else -1
                            if (percent != progress) {
                                progress = percent
                                notify(
                                    this@ApkDownloadService,
                                    buildNotification(
                                        this@ApkDownloadService,
                                        "yump3 업데이트",
                                        "$version 다운로드 중... $percent%",
                                        percent,
                                        false
                                    )
                                )
                            }
                        }
                    }
                }
                finishedPath = dest.absolutePath
                notify(
                    this@ApkDownloadService,
                    buildNotification(
                        this@ApkDownloadService,
                        "yump3 업데이트 준비 완료",
                        "$version · 탭하여 설치",
                        100,
                        true
                    )
                )
            } catch (e: Exception) {
                error = e.message ?: "download failed"
                notify(
                    this@ApkDownloadService,
                    buildNotification(
                        this@ApkDownloadService,
                        "yump3 업데이트 실패",
                        error ?: "",
                        -1,
                        false
                    )
                )
            } finally {
                running = false
                cancelRequested = false
                stopForeground(false)
                stopSelf()
            }
        }.start()

        return START_NOT_STICKY
    }

    companion object {
        const val CHANNEL_ID = "yump3_updates"
        const val NOTIFICATION_ID = 0x7702
        const val FILE_NAME = "yump3-update.apk"
        const val ACTION_CANCEL = "com.android.yustream.UPDATE_CANCEL"
        const val EXTRA_URL = "url"
        const val EXTRA_VERSION = "version"

        @Volatile
        var running = false
            private set

        @Volatile
        var progress = -1
            private set

        @Volatile
        var downloadedBytes = 0L
            private set

        @Volatile
        var totalBytes = 0L
            private set

        @Volatile
        var error: String? = null
            private set

        @Volatile
        var finishedPath: String? = null
            private set

        @Volatile
        private var cancelRequested = false

        fun start(context: Context, url: String, version: String) {
            val intent = Intent(context, ApkDownloadService::class.java).apply {
                putExtra(EXTRA_URL, url)
                putExtra(EXTRA_VERSION, version)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun cancel(context: Context) {
            cancelRequested = true
            context.stopService(Intent(context, ApkDownloadService::class.java))
            running = false
        }

        /** Clears the downloaded file and the in-memory state. */
        fun clear(context: Context) {
            finishedPath = null
            error = null
            progress = -1
            downloadedBytes = 0L
            totalBytes = 0L
            File(context.cacheDir, FILE_NAME).delete()
        }

        fun installIntent(context: Context): Intent? {
            val path = finishedPath ?: return null
            val file = File(path)
            if (!file.exists()) return null
            return try {
                val uri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    file
                )
                Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            } catch (e: Exception) {
                null
            }
        }

        private fun notify(context: Context, notification: Notification) {
            val manager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(NOTIFICATION_ID, notification)
        }

        fun buildNotification(
            context: Context,
            title: String,
            text: String,
            progressValue: Int,
            tappable: Boolean
        ): Notification {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val manager =
                    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                    manager.createNotificationChannel(
                        NotificationChannel(
                            CHANNEL_ID,
                            "앱 업데이트",
                            NotificationManager.IMPORTANCE_LOW
                        )
                    )
                }
            }
            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(title)
                .setContentText(text)
                .setOnlyAlertOnce(true)
                .setOngoing(!tappable)
                .setAutoCancel(tappable)
                .setPriority(NotificationCompat.PRIORITY_LOW)
            if (progressValue >= 0) {
                builder.setProgress(100, progressValue.coerceIn(0, 100), false)
            } else {
                builder.setProgress(0, 0, true)
            }
            if (tappable) {
                installIntent(context)?.let { install ->
                    val pending = PendingIntent.getActivity(
                        context,
                        0,
                        install,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                    builder.setContentIntent(pending)
                }
            }
            return builder.build()
        }
    }
}
