import React, { createContext, type ReactNode, useContext } from 'react';

export type AppTheme = 'light' | 'dark';

const ThemeContext = createContext<AppTheme>('light');

export function ThemeProvider({ theme, children }: { theme: AppTheme; children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/**
 * The theme is server-backed through the user's equipped shop reward.
 * Light remains the safe default before authentication/inventory has loaded.
 */
export function useAppTheme() {
  return useContext(ThemeContext);
}