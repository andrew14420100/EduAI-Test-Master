import { NativeModules, Platform } from 'react-native';

export type NativeAppIconId =
  | 'standard'
  | 'app_icon_midnight'
  | 'app_icon_neon'
  | 'app_icon_scholar'
  | 'app_icon_aurora'
  | 'app_icon_legend';

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
  | { setIcon: (iconId: NativeAppIconId) => Promise<void> }
  | undefined;

/**
 * Expo Go and web do not have access to launcher metadata. They intentionally
 * remain a safe no-op; development/preview native builds use the real module.
 */
export async function setNativeAppIcon(iconId: NativeAppIconId) {
  if (Platform.OS === 'web' || !nativeManager) return;
  try {
    await nativeManager.setIcon(iconId);
  } catch (error) {
    throw new NativeAppIconError(iconId, error);
  }
}
