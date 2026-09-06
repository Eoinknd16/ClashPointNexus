import { deriveThemeVars } from '@shared/colorMath'
import type { ThemeDefinition } from '@shared/themeTypes'
import defaultThemeApps from '../assets/defaultTheme/apps.jpg'
import defaultThemeArcade from '../assets/defaultTheme/arcade.jpg'
import defaultThemeGames from '../assets/defaultTheme/games.jpg'
import defaultThemeHero from '../assets/defaultTheme/hero.jpg'
import defaultThemeTv from '../assets/defaultTheme/tv.jpg'

interface BaseTheme {
  id: string
  name: string
  vars: Record<string, string>
  heroImage?: string
  tileImages?: Record<string, string>
}

// Colors are space-separated RGB channels (e.g. "91 140 255"), not hex —
// that's what lets Tailwind's rgb(var(--x) / <alpha-value>) pattern support
// opacity modifiers like bg-surface/95 while still being theme-swappable.
//
// Only the 7 base colors are listed here — --gradient-app-glow,
// --gradient-accent, --shadow-focus, and --shadow-panel are all mechanically
// derived from these via deriveThemeVars (the same function an installed
// theme pack's colors run through), so every built-in theme automatically
// picks up any tweak to that formula instead of needing its derived values
// hand-updated to match every time.
const BASE_THEMES: BaseTheme[] = [
  {
    // Ships with the app and is selected for every fresh install (see
    // DEFAULT_THEME_ID below) — built from the same theme pack the user
    // assembled and installed locally (own real photography, bundled here
    // as actual renderer assets rather than left to only exist in that
    // one install's userData/Themes folder), so it's a proper built-in
    // like the others: edit its 7 base colors here and every derived
    // value (glow, shadows) updates the same way theirs would.
    id: 'default',
    name: 'Default',
    vars: {
      '--color-bg': '10 10 16',
      '--color-surface': '21 21 31',
      '--color-surface-hi': '30 30 44',
      '--color-surface-hover': '38 38 58',
      '--color-accent': '91 140 255',
      '--color-accent-2': '160 107 255',
      '--color-muted': '143 143 163'
    },
    heroImage: defaultThemeHero,
    tileImages: {
      games: defaultThemeGames,
      tv: defaultThemeTv,
      apps: defaultThemeApps,
      arcade: defaultThemeArcade
    }
  },
  {
    id: 'midnight',
    name: 'Midnight',
    vars: {
      '--color-bg': '10 10 16',
      '--color-surface': '21 21 31',
      '--color-surface-hi': '30 30 44',
      '--color-surface-hover': '38 38 58',
      '--color-accent': '91 140 255',
      '--color-accent-2': '160 107 255',
      '--color-muted': '143 143 163'
    }
  },
  {
    id: 'crimson',
    name: 'Crimson',
    vars: {
      '--color-bg': '13 8 10',
      '--color-surface': '26 15 18',
      '--color-surface-hi': '38 20 24',
      '--color-surface-hover': '52 26 31',
      '--color-accent': '255 71 87',
      '--color-accent-2': '255 145 71',
      '--color-muted': '175 140 143'
    }
  },
  {
    id: 'emerald',
    name: 'Emerald',
    vars: {
      '--color-bg': '7 12 11',
      '--color-surface': '15 24 22',
      '--color-surface-hi': '21 34 31',
      '--color-surface-hover': '28 45 41',
      '--color-accent': '46 214 161',
      '--color-accent-2': '71 191 255',
      '--color-muted': '140 168 161'
    }
  },
  {
    id: 'sunset',
    name: 'Sunset',
    vars: {
      '--color-bg': '14 9 8',
      '--color-surface': '28 18 16',
      '--color-surface-hi': '40 25 21',
      '--color-surface-hover': '54 33 27',
      '--color-accent': '255 148 71',
      '--color-accent-2': '255 92 148',
      '--color-muted': '181 150 138'
    }
  }
]

export const BUILT_IN_THEMES: ThemeDefinition[] = BASE_THEMES.map((theme) => ({
  id: theme.id,
  name: theme.name,
  vars: deriveThemeVars(theme.vars),
  ...(theme.heroImage ? { heroImage: theme.heroImage } : {}),
  ...(theme.tileImages ? { tileImages: theme.tileImages } : {})
}))

export const DEFAULT_THEME_ID = 'default'
