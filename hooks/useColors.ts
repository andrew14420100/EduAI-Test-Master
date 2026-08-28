import colors from '@/constants/colors';
import { useAppTheme } from '@/context/ThemeContext';

/**
 * Returns the design tokens for the server-backed user theme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * The phone's system appearance is intentionally ignored: dark mode is a
 * reward unlocked and equipped from the EduAI shop.
 */
export function useColors() {
  const theme = useAppTheme();
  const palette = colors[theme] ?? colors.light;
  return { ...palette, radius: colors.radius };
}
