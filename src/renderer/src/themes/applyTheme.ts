import { STYLE_DEFAULTS } from '@shared/themeStyle'
import type { ThemeDefinition } from '@shared/themeTypes'

/** Sets every CSS custom property a theme defines on :root — every screen
 * re-colors (and re-shapes/re-spaces/re-animates) instantly since they all
 * reference these vars via Tailwind, not literal values. Style vars
 * (font/radius/card size/spacing/glow/motion — see themeStyle.ts) are merged
 * under the theme's own vars every time, not just at theme-build time —
 * switching TO a theme saved before these vars existed (an old custom theme
 * that hasn't been re-edited) would otherwise leave whatever the *previous*
 * theme set for --radius-card etc. still sitting on :root, since setProperty
 * only ever adds/overwrites keys that are actually present. */
export function applyTheme(theme: ThemeDefinition): void {
  const root = document.documentElement.style
  const vars = { ...STYLE_DEFAULTS, ...theme.vars }
  for (const [key, value] of Object.entries(vars)) {
    root.setProperty(key, value)
  }
}
