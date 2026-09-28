package com.android.yustream

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * Launches the system APK installer for an update downloaded by the app.
 * Android always shows the final install confirmation to the user.
 */
class ApkInstallerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ApkInstaller"

    private fun cleanPath(path: String): String =
        if (path.startsWith("file://")) path.substring(7) else path

    /** Whether this app is currently allowed to request package installs (Android 8+). */
    @ReactMethod
    fun canInstall(promise: Promise) {
        try {
            val allowed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.packageManager.canRequestPackageInstalls()
            } else {
                true
            }
            promise.resolve(allowed)
        } catch (e: Exception) {
            promise.reject("ERR_CAN_INSTALL", e.message, e)
        }
    }

    /** Opens the "install unknown apps" settings page for this app. */
    @ReactMethod
    fun openInstallSettings(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${reactApplicationContext.packageName}")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_SETTINGS", e.message, e)
        }
    }

    /** Starts the package installer for the given APK file. */
    @ReactMethod
    fun install(apkPath: String, promise: Promise) {
        try {
            val file = File(cleanPath(apkPath))
            if (!file.exists()) {
                promise.reject("ERR_INSTALL", "APK not found: ${file.absolutePath}")
                return
            }
            val uri = FileProvider.getUriForFile(
                reactApplicationContext,
                "${reactApplicationContext.packageName}.fileprovider",
                file
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_INSTALL", e.message, e)
        }
    }
}
