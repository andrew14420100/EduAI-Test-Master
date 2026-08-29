package com.eduai.testmaster

import android.content.ComponentName

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.atomic.AtomicReference

class AppIconManagerModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun setIcon(iconId: String, debugScenario: String?, promise: Promise) {
    val selectedAlias = ICON_ALIASES[iconId]
    if (selectedAlias == null) {
      promise.reject(
        "E_INVALID_ICON",
        "Unsupported launcher icon: $iconId",
      )
      return
    }

    if (BuildConfig.DEBUG && debugScenario != null &&
      debugRejectionScenario.compareAndSet(debugScenario, null)
    ) {
      promise.reject(
        "E_DEBUG_ICON_REJECTION",
        "Debug bridge rejection for scenario: $debugScenario",
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

  /**
   * Debug-only harness used by the installable Android verification matrix.
   * The scenario is consumed only by a matching operation and exactly once.
   */
  @ReactMethod
  fun configureDebugRejection(scenario: String, promise: Promise) {
    if (!BuildConfig.DEBUG) {
      promise.reject(
        "E_DEBUG_HARNESS_UNAVAILABLE",
        "The icon rejection harness is available only in debug builds.",
      )
      return
    }
    if (!DEBUG_SCENARIOS.contains(scenario)) {
      promise.reject(
        "E_INVALID_DEBUG_SCENARIO",
        "Unsupported icon rejection scenario: $scenario",
      )
      return
    }
    debugRejectionScenario.set(scenario)
    promise.resolve(null)
  }

  private companion object {
    const val MODULE_NAME = "AppIconManager"
    val DEBUG_SCENARIOS = setOf("acquisto", "equipaggiamento", "ripristino")
    val debugRejectionScenario = AtomicReference<String?>(null)
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