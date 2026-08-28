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
  const visual = {
    fontFamily: theme === 'neon' || theme === 'midnight' ? 'Inter_600SemiBold' : 'Inter_400Regular',
    headingFontFamily: theme === 'forest' || theme === 'arctic' ? 'Inter_700Bold' : 'Inter_800ExtraBold',
    fontWeight: theme === 'sunset' || theme === 'ember' ? '700' as const : '600' as const,
    surface: theme === 'neon' || theme === 'midnight' ? palette.card : palette.background,
    surfaceElevated: palette.card,
    borderWidth: theme === 'neon' || theme === 'ember' ? 1.5 : 1,
    radius: theme === 'neon' ? 10 : theme === 'arctic' ? 14 : colors.radius,
    spacingUnit: theme === 'neon' ? 10 : 8,
    controlHeight: theme === 'neon' || theme === 'midnight' ? 48 : 44,
  };
  return { ...palette, ...visual };
}
