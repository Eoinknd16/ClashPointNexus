import type { ThemeDefinition } from '@shared/themeTypes'

/** Sets every CSS custom property a theme defines on :root — every screen re-colors instantly since they all reference these vars via Tailwind, not literal colors. */
export function applyTheme(theme: ThemeDefinition): void {
  const root = document.documentElement.style
  for (const [key, value] of Object.entries(theme.vars)) {
    root.setProperty(key, value)
  }
}
