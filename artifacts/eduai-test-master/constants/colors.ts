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
    text: '#F4F7FF',
    tint: '#7CF6D3',

    // Core surfaces
    background: '#08111F',
    foreground: '#F4F7FF',

    // Cards / elevated surfaces
    card: '#101E31',
    cardForeground: '#F4F7FF',

    // Primary action color (buttons, links, active states)
    primary: '#7CF6D3',
    primaryForeground: '#08111F',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#152941',
    secondaryForeground: '#DCE7F7',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#152941',
    mutedForeground: '#8FA2BE',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#19364A',
    accentForeground: '#7CF6D3',

    // Destructive actions (delete, error states)
    destructive: '#FF7181',
    destructiveForeground: '#08111F',

    // Borders and input outlines
    border: '#213650',
    input: '#213650',
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
