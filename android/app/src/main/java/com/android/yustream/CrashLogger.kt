package com.android.yustream

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Writes crash diagnostics to a user-accessible file so the app can be diagnosed
 * on a device without adb.
 *
 * Primary location (visible in file managers / over USB):
 *   /storage/emulated/0/Android/media/com.yump3/yump3/crash.txt
 * Fallback (also read by JS on the next launch):
 *   <app files>/crash.txt
 */
object CrashLogger {
    private const val FILE_NAME = "crash.txt"

    @Volatile
    private var installed = false

    fun install(context: Context) {
        if (installed) return
        installed = true
        val app = context.applicationContext ?: context

        // 1) Capture a previous crash that happened before this process started,
        //    including native (SIGSEGV) crashes via ApplicationExitInfo (API 30+).
        recordPreviousExitIfNeeded(app)

        // 2) Capture uncaught Java/Kotlin exceptions (module init failures, RN
        //    re-thrown JS exceptions, etc.) for the current process.
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                val sw = StringWriter()
                throwable.printStackTrace(PrintWriter(sw))
                val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
                val text = buildString {
                    append("==== yump3 crash (java) ====\n")
                    append("time: ").append(timestamp).append('\n')
                    append("thread: ").append(thread.name).append('\n')
                    append("type: ").append(throwable.javaClass.name).append('\n')
                    append("message: ").append(throwable.message).append("\n\n")
                    append(sw.toString())
                }
                write(app, text)
            } catch (_: Throwable) {
                // Never let logging mask the original crash.
            }
            previous?.uncaughtException(thread, throwable)
        }
    }

    private fun recordPreviousExitIfNeeded(app: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        if (crashFileExists(app)) return

        try {
            val am = app.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return
            val infos: List<ApplicationExitInfo> =
                am.getHistoricalProcessExitReasons(app.packageName, 0, 10) ?: return
            for (info in infos) {
                val reason = info.reason
                val isCrash = reason == ApplicationExitInfo.REASON_CRASH ||
                    reason == ApplicationExitInfo.REASON_CRASH_NATIVE ||
                    reason == ApplicationExitInfo.REASON_ANR
                if (!isCrash) continue

                val sb = StringBuilder()
                sb.append("==== yump3 previous exit ====\n")
                sb.append("reason: ").append(reasonName(reason)).append(" (").append(reason).append(")\n")
                sb.append("description: ").append(info.description ?: "(none)").append('\n')
                sb.append("status: ").append(info.status).append('\n')
                sb.append("importance: ").append(info.importance).append('\n')
                sb.append("timestamp: ").append(info.timestamp).append("\n\n")
                try {
                    info.traceInputStream?.use { input ->
                        sb.append(input.bufferedReader().readText())
                    }
                } catch (_: Throwable) {
                    // Trace not available (common for native crashes).
                }
                write(app, sb.toString())
                break
            }
        } catch (_: Throwable) {
            // ignore
        }
    }

    private fun reasonName(reason: Int): String = when (reason) {
        ApplicationExitInfo.REASON_CRASH -> "CRASH (java)"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "CRASH_NATIVE (sigsegv)"
        ApplicationExitInfo.REASON_ANR -> "ANR"
        else -> "OTHER"
    }

    private fun crashFileExists(app: Context): Boolean {
        val mediaDirs = app.getExternalMediaDirs()
        if (mediaDirs != null && mediaDirs.isNotEmpty() && mediaDirs[0] != null) {
            if (File(File(mediaDirs[0], "yump3"), FILE_NAME).exists()) return true
        }
        return File(app.filesDir, FILE_NAME).exists()
    }

    private fun write(app: Context, text: String) {
        val mediaDirs = app.getExternalMediaDirs()
        if (mediaDirs != null && mediaDirs.isNotEmpty() && mediaDirs[0] != null) {
            val dir = File(mediaDirs[0], "yump3")
            if (dir.exists() || dir.mkdirs()) {
                File(dir, FILE_NAME).writeText(text)
            }
        }
        File(app.filesDir, FILE_NAME).writeText(text)
    }
}
