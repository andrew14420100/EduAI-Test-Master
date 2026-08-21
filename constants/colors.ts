/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#12352D',
    tint: '#0B8A6A',

    // Core surfaces
    background: '#F7FBF8',
    foreground: '#12352D',

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#12352D',

    // Primary action color (buttons, links, active states)
    primary: '#0B8A6A',
    primaryForeground: '#FFFFFF',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#E8F2EE',
    secondaryForeground: '#28584B',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#EEF5F1',
    mutedForeground: '#61756E',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#D5F4E8',
    accentForeground: '#086E55',

    // Destructive actions (delete, error states)
    destructive: '#C53B4B',
    destructiveForeground: '#FFFFFF',

    // Borders and input outlines
    border: '#D8E6DF',
    input: '#BBD0C7',
  },
  dark: {
    text: '#F4F7FF',
    tint: '#7CF6D3',
    background: '#08111F',
    foreground: '#F4F7FF',
    card: '#101E31',
    cardForeground: '#F4F7FF',
    primary: '#7CF6D3',
    primaryForeground: '#08111F',
    secondary: '#152941',
    secondaryForeground: '#DCE7F7',
    muted: '#152941',
    mutedForeground: '#8FA2BE',
    accent: '#19364A',
    accentForeground: '#7CF6D3',
    destructive: '#FF7181',
    destructiveForeground: '#08111F',
    border: '#213650',
    input: '#213650',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
