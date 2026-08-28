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
  neon: {
    text: '#F9F7FF',
    tint: '#C58CFF',
    background: '#100D1D',
    foreground: '#F9F7FF',
    card: '#1D1730',
    cardForeground: '#F9F7FF',
    primary: '#C58CFF',
    primaryForeground: '#180D2B',
    secondary: '#2A2141',
    secondaryForeground: '#EADFFF',
    muted: '#241D39',
    mutedForeground: '#B7A8D1',
    accent: '#2B463F',
    accentForeground: '#75F5C3',
    destructive: '#FF7181',
    destructiveForeground: '#220A11',
    border: '#4C3B70',
    input: '#4C3B70',
  },
  ocean: {
    text: '#EAF8FF',
    tint: '#5CD6E8',
    background: '#071A27',
    foreground: '#EAF8FF',
    card: '#0E2A3B',
    cardForeground: '#EAF8FF',
    primary: '#5CD6E8',
    primaryForeground: '#06202B',
    secondary: '#12384C',
    secondaryForeground: '#D5F3FA',
    muted: '#103144',
    mutedForeground: '#8BB4C3',
    accent: '#164B59',
    accentForeground: '#7DE7F1',
    destructive: '#FF8490',
    destructiveForeground: '#210A10',
    border: '#245166',
    input: '#245166',
  },
  forest: {
    text: '#F0F8F0',
    tint: '#91D36B',
    background: '#0D1B16',
    foreground: '#F0F8F0',
    card: '#172C23',
    cardForeground: '#F0F8F0',
    primary: '#91D36B',
    primaryForeground: '#12200F',
    secondary: '#203B2E',
    secondaryForeground: '#DDEEDB',
    muted: '#1B3327',
    mutedForeground: '#9FBAA8',
    accent: '#31523A',
    accentForeground: '#B6F58F',
    destructive: '#FF8790',
    destructiveForeground: '#210A10',
    border: '#355845',
    input: '#355845',
  },
  sunset: {
    text: '#FFF7F1',
    tint: '#FFB36B',
    background: '#24151A',
    foreground: '#FFF7F1',
    card: '#382127',
    cardForeground: '#FFF7F1',
    primary: '#FFB36B',
    primaryForeground: '#30150A',
    secondary: '#4A2930',
    secondaryForeground: '#FFE4D3',
    muted: '#43262D',
    mutedForeground: '#CBA99A',
    accent: '#653A36',
    accentForeground: '#FFD0A3',
    destructive: '#FF8790',
    destructiveForeground: '#2B0A10',
    border: '#70433E',
    input: '#70433E',
  },
  midnight: {
    text: '#F0F3FF',
    tint: '#8CA8FF',
    background: '#090D20',
    foreground: '#F0F3FF',
    card: '#141A37',
    cardForeground: '#F0F3FF',
    primary: '#8CA8FF',
    primaryForeground: '#0A102B',
    secondary: '#202850',
    secondaryForeground: '#DDE4FF',
    muted: '#1A2143',
    mutedForeground: '#9EA9CF',
    accent: '#2D3C70',
    accentForeground: '#B7C7FF',
    destructive: '#FF8190',
    destructiveForeground: '#250A10',
    border: '#354274',
    input: '#354274',
  },
  ember: {
    text: '#FFF7ED',
    tint: '#FF9B55',
    background: '#24130E',
    foreground: '#FFF7ED',
    card: '#3A2017',
    cardForeground: '#FFF7ED',
    primary: '#FF9B55',
    primaryForeground: '#321408',
    secondary: '#512B1C',
    secondaryForeground: '#FFE2C5',
    muted: '#482619',
    mutedForeground: '#CBA38D',
    accent: '#6B3A1F',
    accentForeground: '#FFC080',
    destructive: '#FF8290',
    destructiveForeground: '#29090E',
    border: '#75442B',
    input: '#75442B',
  },
  arctic: {
    text: '#17303B',
    tint: '#087F9B',
    background: '#F2FAFC',
    foreground: '#17303B',
    card: '#FFFFFF',
    cardForeground: '#17303B',
    primary: '#087F9B',
    primaryForeground: '#FFFFFF',
    secondary: '#DCEFF4',
    secondaryForeground: '#245363',
    muted: '#E7F4F7',
    mutedForeground: '#64808A',
    accent: '#C9F0F5',
    accentForeground: '#086278',
    destructive: '#C53B4B',
    destructiveForeground: '#FFFFFF',
    border: '#B9D8DF',
    input: '#9EC3CC',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
