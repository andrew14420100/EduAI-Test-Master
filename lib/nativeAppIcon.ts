import { NativeModules, Platform } from 'react-native';

export type NativeAppIconId =
  | 'standard'
  | 'app_icon_midnight'
  | 'app_icon_neon'
  | 'app_icon_scholar'
  | 'app_icon_aurora'
  | 'app_icon_legend';

const nativeManager = NativeModules.AppIconManager as
  | { setIcon: (iconId: NativeAppIconId) => Promise<void> }
  | undefined;

/**
 * Expo Go and web do not have access to launcher metadata. They intentionally
 * remain a safe no-op; development/preview native builds use the real module.
 */
export async function setNativeAppIcon(iconId: NativeAppIconId) {
  if (Platform.OS === 'web' || !nativeManager) return;
  await nativeManager.setIcon(iconId);
}