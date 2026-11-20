// The color themes a learner can pick from the bookshelf. Ids are the
// themes' original names, kept so saved choices still load. Each is a whole
// palette (page background, cards, text, borders and accents), in a light
// and a dark variant that follow the system's color scheme. applyColorTheme
// puts them on the page as --theme-light-* / --theme-dark-* variables;
// index.css picks the variant (--theme-*), and the themed pages build their
// --pl-* palettes from those. The choice is kept in this browser.

// Palette keys and their CSS variable names
const PALETTE_KEYS = {
  bg: 'bg',
  surface: 'surface',
  ink: 'ink',
  muted: 'muted',
  line: 'line',
  accent: 'accent',
  accentHover: 'accent-hover',
  accent2: 'accent-2',
  onAccent: 'on-accent',
}

export const COLOR_THEMES = [
  {
    id: 'sakura',
    name: 'Blossom',
    light: { bg: '#faf7f2', surface: '#ffffff', ink: '#1b1a2e', muted: '#5b5870', line: '#e7e1d6', accent: '#e0457b', accentHover: '#c8336a', accent2: '#5b4bdb', onAccent: '#ffffff' },
    dark: { bg: '#12111c', surface: '#1c1b2b', ink: '#f4f2fb', muted: '#b3b0c7', line: '#34324a', accent: '#ff6b9a', accentHover: '#ff86ad', accent2: '#9d90ff', onAccent: '#1a0b13' },
  },
  {
    id: 'umi',
    name: 'Ocean',
    light: { bg: '#f1f6fa', surface: '#ffffff', ink: '#0f2333', muted: '#4a6274', line: '#d4e2ec', accent: '#1f6fd1', accentHover: '#185bb0', accent2: '#0e9aa7', onAccent: '#ffffff' },
    dark: { bg: '#0a1520', surface: '#11202d', ink: '#e8f3fa', muted: '#9db6c7', line: '#233a4b', accent: '#4fa3f7', accentHover: '#74b8fa', accent2: '#2fd1d1', onAccent: '#06121c' },
  },
  {
    id: 'matcha',
    name: 'Forest',
    light: { bg: '#f3f6ec', surface: '#fdfefa', ink: '#1c2a1e', muted: '#55655a', line: '#dde4d0', accent: '#3d8a4f', accentHover: '#2f7140', accent2: '#8a9a2a', onAccent: '#ffffff' },
    dark: { bg: '#0e150f', surface: '#162018', ink: '#eef5ec', muted: '#a7b9a8', line: '#29392b', accent: '#6fcf86', accentHover: '#8fdca1', accent2: '#c3d662', onAccent: '#0a160d' },
  },
  {
    id: 'yuuhi',
    name: 'Sunset',
    light: { bg: '#fdf4ec', surface: '#ffffff', ink: '#2e1a12', muted: '#6e5548', line: '#f0dacb', accent: '#e3561b', accentHover: '#c44612', accent2: '#d6336c', onAccent: '#ffffff' },
    dark: { bg: '#1a100b', surface: '#261812', ink: '#fbefe8', muted: '#c9ada0', line: '#402a20', accent: '#ff8a4c', accentHover: '#ffa575', accent2: '#ff6b8f', onAccent: '#1f0e04' },
  },
  {
    id: 'fuji',
    name: 'Lavender',
    light: { bg: '#f7f3fc', surface: '#ffffff', ink: '#241a33', muted: '#645a75', line: '#e3daf0', accent: '#7c3aed', accentHover: '#6d28d9', accent2: '#c026d3', onAccent: '#ffffff' },
    dark: { bg: '#140e1e', surface: '#1f172d', ink: '#f5f0fc', muted: '#b9aecb', line: '#372b4b', accent: '#b197fc', accentHover: '#c8b6fd', accent2: '#e879f9', onAccent: '#150b26' },
  },
  {
    id: 'yoru',
    name: 'Midnight',
    light: { bg: '#eff2f8', surface: '#ffffff', ink: '#141a2e', muted: '#50597a', line: '#d7dceb', accent: '#3b5bdb', accentHover: '#2f49b5', accent2: '#15aabf', onAccent: '#ffffff' },
    dark: { bg: '#070b16', surface: '#0f1526', ink: '#e6ebf7', muted: '#98a3c0', line: '#1f2942', accent: '#748ffc', accentHover: '#91a7ff', accent2: '#3bc9db', onAccent: '#070b16' },
  },
  {
    id: 'kin',
    name: 'Gold',
    light: { bg: '#fbf6e9', surface: '#fffdf6', ink: '#2a2210', muted: '#6b5f45', line: '#ebe0c3', accent: '#b7791f', accentHover: '#975a16', accent2: '#c05621', onAccent: '#ffffff' },
    dark: { bg: '#15120a', surface: '#201b10', ink: '#f8f2e2', muted: '#c4b896', line: '#3b3320', accent: '#f6c343', accentHover: '#f9d26e', accent2: '#f08c4a', onAccent: '#1f1503' },
  },
  {
    id: 'momiji',
    name: 'Autumn',
    light: { bg: '#fbf2ef', surface: '#ffffff', ink: '#2c1414', muted: '#6e5050', line: '#efd6d1', accent: '#c0392b', accentHover: '#a0301f', accent2: '#d97706', onAccent: '#ffffff' },
    dark: { bg: '#180c0c', surface: '#241414', ink: '#fbeeee', muted: '#c8a6a6', line: '#3e2424', accent: '#ff6b5e', accentHover: '#ff8c82', accent2: '#fbbf24', onAccent: '#240707' },
  },
  {
    id: 'hisui',
    name: 'Jade',
    light: { bg: '#eff7f4', surface: '#ffffff', ink: '#0f2924', muted: '#4a6660', line: '#d1e5df', accent: '#0f8f80', accentHover: '#0b7368', accent2: '#4c9f38', onAccent: '#ffffff' },
    dark: { bg: '#091614', surface: '#10221f', ink: '#e6f6f2', muted: '#98bdb5', line: '#1f3a35', accent: '#34d1bf', accentHover: '#5fe0d1', accent2: '#8ce99a', onAccent: '#04201c' },
  },
  {
    id: 'sumi',
    name: 'Ink',
    light: { bg: '#f5f5f3', surface: '#ffffff', ink: '#1a1a1a', muted: '#5c5c5c', line: '#e0e0dc', accent: '#2b2b2b', accentHover: '#000000', accent2: '#6b6b6b', onAccent: '#ffffff' },
    dark: { bg: '#111111', surface: '#1b1b1b', ink: '#f2f2f2', muted: '#a8a8a8', line: '#333333', accent: '#e8e8e8', accentHover: '#ffffff', accent2: '#9a9a9a', onAccent: '#111111' },
  },
]

export const DEFAULT_COLOR_THEME = 'sakura'
const STORAGE_KEY = 'yomu-color-theme'

const findTheme = (id) => COLOR_THEMES.find((theme) => theme.id === id)

export function loadColorTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (findTheme(saved)) return saved
  } catch {
    // Use the default
  }
  return DEFAULT_COLOR_THEME
}

function setThemeVariables(theme) {
  const style = document.documentElement.style
  for (const mode of ['light', 'dark']) {
    for (const [key, name] of Object.entries(PALETTE_KEYS)) {
      style.setProperty(`--theme-${mode}-${name}`, theme[mode][key])
    }
  }
  document.documentElement.dataset.colorTheme = theme.id
}

// Switches the whole site to the theme with `id`. With `animate`, the page
// crossfades from the old colors to the new ones where the browser can.
export function applyColorTheme(id, { animate = false } = {}) {
  const theme = findTheme(id) ?? findTheme(DEFAULT_COLOR_THEME)
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  if (animate && !reduceMotion && document.startViewTransition) {
    document.startViewTransition(() => setThemeVariables(theme))
  } else {
    setThemeVariables(theme)
  }
}

export function saveColorTheme(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // The theme still applies until the page reloads
  }
}
