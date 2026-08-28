package com.eduai.testmaster

import android.content.ComponentName

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AppIconManagerModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun setIcon(iconId: String, promise: Promise) {
    val selectedAlias = ICON_ALIASES[iconId]
    if (selectedAlias == null) {
      promise.reject(
        "E_INVALID_ICON",
        "Unsupported launcher icon: $iconId",
      )
      return
    }

    try {
      val packageManager = reactContext.packageManager
      val packageName = reactContext.packageName

      ICON_ALIASES.values.forEach { aliasName ->
        val component = ComponentName(packageName, "$packageName.$aliasName")
        val state = if (aliasName == selectedAlias) {
          android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        } else {
          android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        }
        packageManager.setComponentEnabledSetting(
          component,
          state,
          android.content.pm.PackageManager.DONT_KILL_APP,
        )
      }

      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject(
        "E_ICON_UPDATE",
        "Unable to update the launcher icon.",
        error,
      )
    }
  }

  private companion object {
    const val MODULE_NAME = "AppIconManager"
    val ICON_ALIASES = mapOf(
      "standard" to "StandardLauncher",
      "app_icon_midnight" to "MidnightLauncher",
      "app_icon_neon" to "NeonLauncher",
      "app_icon_scholar" to "ScholarLauncher",
      "app_icon_aurora" to "AuroraLauncher",
      "app_icon_legend" to "LegendLauncher",
    )
  }
}