import { NativeModules, Platform } from 'react-native';

export type NativeAppIconId =
  | 'standard'
  | 'app_icon_midnight'
  | 'app_icon_neon'
  | 'app_icon_scholar'
  | 'app_icon_aurora'
  | 'app_icon_legend';

export type NativeIconDebugScenario =
  | 'acquisto'
  | 'equipaggiamento'
  | 'ripristino';

type NativeAppIconBridgeError = {
  code?: unknown;
  message?: unknown;
};

export class NativeAppIconError extends Error {
  readonly code: string | undefined;
  readonly iconId: NativeAppIconId;

  constructor(iconId: NativeAppIconId, error: unknown) {
    const bridgeError = error as NativeAppIconBridgeError | null;
    const message = typeof bridgeError?.message === 'string' ? bridgeError.message : undefined;
    super(message ?? 'Native launcher icon update failed.');
    this.name = 'NativeAppIconError';
    this.code = typeof bridgeError?.code === 'string' ? bridgeError.code : undefined;
    this.iconId = iconId;
  }
}

const nativeManager = NativeModules.AppIconManager as
  | {
      setIcon: (
        iconId: NativeAppIconId,
        debugScenario?: NativeIconDebugScenario,
      ) => Promise<void>;
      configureDebugRejection?: (scenario: NativeIconDebugScenario) => Promise<void>;
    }
  | undefined;

export function isNativeIconDebugScenario(value: unknown): value is NativeIconDebugScenario {
  return value === 'acquisto' || value === 'equipaggiamento' || value === 'ripristino';
}

/**
 * Expo Go and web do not have access to launcher metadata. They intentionally
 * remain a safe no-op; development/preview native builds use the real module.
 */
export async function setNativeAppIcon(
  iconId: NativeAppIconId,
  debugScenario?: NativeIconDebugScenario,
) {
  if (Platform.OS === 'web' || !nativeManager) return;
  try {
    if ((Platform.OS === 'android' || Platform.OS === 'ios') && debugScenario) {
      await nativeManager.setIcon(iconId, debugScenario);
    } else {
      await nativeManager.setIcon(iconId);
    }
  } catch (error) {
    throw new NativeAppIconError(iconId, error);
  }
}

/**
 * Arms the native bridge rejection harness on installable development builds.
 * It is intentionally gated by __DEV__ so release JavaScript bundles cannot
 * configure it; the native bridge applies its own DEBUG/Info.plist guard.
 */
export async function configureNativeIconDebugRejection(
  scenario: NativeIconDebugScenario,
) {
  if (
    !__DEV__
    || (Platform.OS !== 'android' && Platform.OS !== 'ios')
    || !nativeManager?.configureDebugRejection
  ) {
    return;
  }
  try {
    await nativeManager.configureDebugRejection(scenario);
  } catch (error) {
    throw new NativeAppIconError('standard', error);
  }
}
