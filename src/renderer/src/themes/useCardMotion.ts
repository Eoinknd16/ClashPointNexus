import { useThemeStore } from '../state/themeStore'

/** Numeric read of the active theme's --motion-* vars (see
 * shared/themeStyle.ts's MOTION_OPTIONS) for FocusableCard's framer-motion
 * spring — framer-motion animates via real JS numbers, not CSS, so this
 * can't just be a Tailwind class the way radius/spacing are. Falls back to
 * this app's original hardcoded "snappy" values if a var is missing or
 * unparseable (a theme saved before motion theming existed and not yet
 * re-applied — applyTheme.ts's own STYLE_DEFAULTS merge covers the normal
 * case, this is just defense in depth for this one JS-side read). */
export interface CardMotion {
  stiffness: number
  damping: number
  scaleFocus: number
  lift: number
  tapScale: number
}

const FALLBACK: CardMotion = { stiffness: 420, damping: 30, scaleFocus: 1.05, lift: 6, tapScale: 0.97 }

function num(vars: Record<string, string> | undefined, key: string, fallback: number): number {
  const parsed = vars?.[key] !== undefined ? parseFloat(vars[key]) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

export function useCardMotion(): CardMotion {
  const vars = useThemeStore((s) => s.allThemes.find((t) => t.id === s.themeId)?.vars)
  return {
    stiffness: num(vars, '--motion-stiffness', FALLBACK.stiffness),
    damping: num(vars, '--motion-damping', FALLBACK.damping),
    scaleFocus: num(vars, '--motion-scale-focus', FALLBACK.scaleFocus),
    lift: num(vars, '--motion-lift', FALLBACK.lift),
    tapScale: num(vars, '--motion-tap-scale', FALLBACK.tapScale)
  }
}
