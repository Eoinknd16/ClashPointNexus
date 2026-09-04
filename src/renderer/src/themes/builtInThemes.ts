import type { ThemeDefinition } from '@shared/themeTypes'

// Colors are space-separated RGB channels (e.g. "91 140 255"), not hex —
// that's what lets Tailwind's rgb(var(--x) / <alpha-value>) pattern support
// opacity modifiers like bg-surface/95 while still being theme-swappable.
export const BUILT_IN_THEMES: ThemeDefinition[] = [
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
      '--color-muted': '143 143 163',
      '--gradient-app-glow':
        'radial-gradient(ellipse 80% 60% at 15% -10%, rgba(91,140,255,0.16), transparent 60%), radial-gradient(ellipse 70% 50% at 100% 10%, rgba(160,107,255,0.12), transparent 60%)',
      '--gradient-accent': 'linear-gradient(135deg, rgb(91,140,255) 0%, rgb(160,107,255) 100%)',
      '--shadow-focus':
        '0 0 0 3px rgba(91,140,255,0.6), 0 0 18px rgba(91,140,255,0.22), 0 8px 20px rgba(0,0,0,0.45)',
      '--shadow-panel': '-24px 0 60px rgba(0,0,0,0.5)'
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
      '--color-muted': '175 140 143',
      '--gradient-app-glow':
        'radial-gradient(ellipse 80% 60% at 15% -10%, rgba(255,71,87,0.18), transparent 60%), radial-gradient(ellipse 70% 50% at 100% 10%, rgba(255,145,71,0.12), transparent 60%)',
      '--gradient-accent': 'linear-gradient(135deg, rgb(255,71,87) 0%, rgb(255,145,71) 100%)',
      '--shadow-focus':
        '0 0 0 3px rgba(255,71,87,0.6), 0 0 18px rgba(255,71,87,0.22), 0 8px 20px rgba(0,0,0,0.45)',
      '--shadow-panel': '-24px 0 60px rgba(0,0,0,0.5)'
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
      '--color-muted': '140 168 161',
      '--gradient-app-glow':
        'radial-gradient(ellipse 80% 60% at 15% -10%, rgba(46,214,161,0.16), transparent 60%), radial-gradient(ellipse 70% 50% at 100% 10%, rgba(71,191,255,0.12), transparent 60%)',
      '--gradient-accent': 'linear-gradient(135deg, rgb(46,214,161) 0%, rgb(71,191,255) 100%)',
      '--shadow-focus':
        '0 0 0 3px rgba(46,214,161,0.6), 0 0 18px rgba(46,214,161,0.22), 0 8px 20px rgba(0,0,0,0.45)',
      '--shadow-panel': '-24px 0 60px rgba(0,0,0,0.5)'
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
      '--color-muted': '181 150 138',
      '--gradient-app-glow':
        'radial-gradient(ellipse 80% 60% at 15% -10%, rgba(255,148,71,0.18), transparent 60%), radial-gradient(ellipse 70% 50% at 100% 10%, rgba(255,92,148,0.14), transparent 60%)',
      '--gradient-accent': 'linear-gradient(135deg, rgb(255,148,71) 0%, rgb(255,92,148) 100%)',
      '--shadow-focus':
        '0 0 0 3px rgba(255,148,71,0.6), 0 0 18px rgba(255,148,71,0.22), 0 8px 20px rgba(0,0,0,0.45)',
      '--shadow-panel': '-24px 0 60px rgba(0,0,0,0.5)'
    }
  }
]

export const DEFAULT_THEME_ID = 'midnight'
