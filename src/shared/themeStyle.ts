/** The "style" half of a theme — everything beyond the 7 base colors:
 * typography, corner roundness, card size, spacing, glow intensity, and
 * motion. Same delivery mechanism as colors (see colorMath.ts's
 * deriveThemeVars): each option here is just a handful of CSS custom
 * properties, folded into a theme's existing `vars` bag — no schema change
 * to ThemeDefinition, no new install/export/community-sharing pipeline.
 * Curated presets rather than raw sliders, on purpose — "make theme making
 * more accessible" means picking from options that always look good, not
 * hand-tuning numbers. */

export interface StyleOption {
  id: string
  label: string
  vars: Record<string, string>
}

/** Real font FAMILIES, not weights — kept to fonts that ship with Windows so
 * there's no bundling/network dependency (this app has to work offline).
 * Each var is a full CSS font-family fallback list on its own, so it slots
 * into Tailwind's `fontFamily.sans` as a single list item (see
 * tailwind.config.js) without losing the outer safety-net fallbacks. */
export const FONT_OPTIONS: StyleOption[] = [
  {
    id: 'default',
    label: 'Default',
    vars: { '--font-sans': '"Segoe UI", "Segoe UI Variable", system-ui, sans-serif' }
  },
  {
    id: 'rounded',
    label: 'Rounded',
    vars: { '--font-sans': '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif' }
  },
  {
    id: 'technical',
    label: 'Technical',
    vars: { '--font-sans': '"Cascadia Mono", Consolas, "Courier New", monospace' }
  },
  {
    id: 'classic',
    label: 'Classic',
    vars: { '--font-sans': 'Cambria, Georgia, "Times New Roman", serif' }
  }
]

/** --radius-control intentionally stays pill-shaped (9999px) for every
 * preset but Sharp — pills/switches/nav capsules read as broken, not
 * "sharp", if squared off along with cards. */
export const RADIUS_OPTIONS: StyleOption[] = [
  {
    id: 'sharp',
    label: 'Sharp',
    vars: { '--radius-card': '0.5rem', '--radius-panel': '0.75rem', '--radius-control': '0.5rem' }
  },
  {
    id: 'soft',
    label: 'Soft',
    vars: { '--radius-card': '1rem', '--radius-panel': '1.25rem', '--radius-control': '9999px' }
  },
  {
    id: 'round',
    label: 'Round',
    vars: { '--radius-card': '1.5rem', '--radius-panel': '1.75rem', '--radius-control': '9999px' }
  },
  {
    id: 'full',
    label: 'Full',
    vars: { '--radius-card': '2rem', '--radius-panel': '2.25rem', '--radius-control': '9999px' }
  }
]

/** Scales CategoryRow's grid track width (see CategoryRow.tsx's ROW_CLASSES)
 * — not applied to FocusableCard itself via transform, which would fight
 * framer-motion's own animated transform on the same element. Home's 7-tile
 * row deliberately doesn't use this (see HomeMenu.tsx) — it's a fixed
 * 7-equal-columns layout where resizing one tile would break the row. */
export const CARD_SIZE_OPTIONS: StyleOption[] = [
  { id: 'compact', label: 'Compact', vars: { '--card-scale': '0.8' } },
  { id: 'default', label: 'Default', vars: { '--card-scale': '1' } },
  { id: 'large', label: 'Large', vars: { '--card-scale': '1.2' } }
]

export const DENSITY_OPTIONS: StyleOption[] = [
  { id: 'compact', label: 'Compact', vars: { '--space-grid-gap': '1.25rem' } },
  { id: 'comfortable', label: 'Comfortable', vars: { '--space-grid-gap': '2rem' } },
  { id: 'spacious', label: 'Spacious', vars: { '--space-grid-gap': '2.75rem' } }
]

/** Only scales the *ambient bloom* (see colorMath.ts's deriveThemeVars) —
 * the crisp 3px focus ring itself stays at fixed opacity no matter what,
 * since that ring is how a controller user tracks focus at all; "Off" here
 * means no colorful halo, not an invisible cursor. */
export const GLOW_OPTIONS: StyleOption[] = [
  { id: 'off', label: 'Off', vars: { '--glow-intensity': '0' } },
  { id: 'subtle', label: 'Subtle', vars: { '--glow-intensity': '0.5' } },
  { id: 'normal', label: 'Normal', vars: { '--glow-intensity': '1' } },
  { id: 'intense', label: 'Intense', vars: { '--glow-intensity': '1.6' } }
]

/** Named spring presets for FocusableCard's focus animation (see
 * useCardMotion.ts) — "snappy" matches this app's original hardcoded
 * values exactly, so picking it back is a true no-op visually. Each preset
 * writes both --motion-preset (its own name, for the picker's own use) and
 * the full set of numeric vars a card actually animates with; see
 * resolveStyleVars below for what happens when only the name is set by hand
 * (e.g. a community theme.json). */
export const MOTION_OPTIONS: StyleOption[] = [
  {
    id: 'minimal',
    label: 'Minimal',
    vars: {
      '--motion-preset': 'minimal',
      '--motion-stiffness': '500',
      '--motion-damping': '50',
      '--motion-scale-focus': '1.02',
      '--motion-lift': '2',
      '--motion-tap-scale': '0.99'
    }
  },
  {
    id: 'snappy',
    label: 'Snappy',
    vars: {
      '--motion-preset': 'snappy',
      '--motion-stiffness': '420',
      '--motion-damping': '30',
      '--motion-scale-focus': '1.05',
      '--motion-lift': '6',
      '--motion-tap-scale': '0.97'
    }
  },
  {
    id: 'smooth',
    label: 'Smooth',
    vars: {
      '--motion-preset': 'smooth',
      '--motion-stiffness': '220',
      '--motion-damping': '26',
      '--motion-scale-focus': '1.04',
      '--motion-lift': '4',
      '--motion-tap-scale': '0.98'
    }
  },
  {
    id: 'bouncy',
    label: 'Bouncy',
    vars: {
      '--motion-preset': 'bouncy',
      '--motion-stiffness': '300',
      '--motion-damping': '14',
      '--motion-scale-focus': '1.08',
      '--motion-lift': '10',
      '--motion-tap-scale': '0.94'
    }
  }
]

export interface StyleAxis {
  key: string
  label: string
  hint: string
  options: StyleOption[]
}

/** Drives both the Theme Editor's Style tab (cycle through each axis) and
 * activeStyleOptionIndex below (finding what's currently selected). Order
 * here is also the order the editor lists them in. */
export const STYLE_AXES: StyleAxis[] = [
  { key: 'font', label: 'Typography', hint: 'Font used across the whole app', options: FONT_OPTIONS },
  { key: 'radius', label: 'Corner Roundness', hint: 'How square or round cards & panels are', options: RADIUS_OPTIONS },
  { key: 'cardSize', label: 'Card Size', hint: 'Size of cards in browsing rows (Games, TV, Store...)', options: CARD_SIZE_OPTIONS },
  { key: 'density', label: 'Spacing', hint: 'Gap between cards and tiles', options: DENSITY_OPTIONS },
  { key: 'glow', label: 'Glow Intensity', hint: 'Strength of the ambient accent-color glow', options: GLOW_OPTIONS },
  { key: 'motion', label: 'Animation Style', hint: 'How cards move when focused', options: MOTION_OPTIONS }
]

/** Every style var, defaulted to whatever this app already looked like
 * before this feature existed — deriveThemeVars merges this under every
 * theme's own vars (see colorMath.ts), and applyTheme merges it again on
 * every switch (see applyTheme.ts), so a theme built or saved before these
 * vars existed still gets a fully-populated, non-stale set on every render. */
export const STYLE_DEFAULTS: Record<string, string> = {
  ...FONT_OPTIONS[0].vars,
  ...RADIUS_OPTIONS[1].vars,
  ...CARD_SIZE_OPTIONS[1].vars,
  ...DENSITY_OPTIONS[1].vars,
  ...GLOW_OPTIONS[2].vars,
  ...MOTION_OPTIONS[1].vars
}

/** Resolves a theme's raw `vars` into a complete style set: defaults filled
 * in first, the theme's own explicit vars win — with one special case.
 * Motion is the one axis where a single var (--motion-preset) implies
 * several others (the actual spring numbers); if something set the preset
 * name by hand without also setting the numbers (a hand-authored community
 * theme.json, most likely), fill those in from the named preset instead of
 * leaving them at whatever --motion-preset used to imply. */
export function resolveStyleVars(vars: Record<string, string>): Record<string, string> {
  const merged = { ...STYLE_DEFAULTS, ...vars }
  const presetId = vars['--motion-preset']
  if (presetId && vars['--motion-stiffness'] === undefined) {
    const preset = MOTION_OPTIONS.find((o) => o.id === presetId)
    if (preset) Object.assign(merged, preset.vars)
  }
  return merged
}

/** Which option on one axis a theme's vars currently match — compares the
 * axis's first var only (its "primary" key), since that alone is always
 * enough to tell the presets apart. Falls back to the axis's default option
 * index when nothing matches (a foreign/hand-edited value), so the editor
 * always has something valid to show as selected. */
export function activeStyleOptionIndex(axis: StyleAxis, vars: Record<string, string>): number {
  const primaryKey = Object.keys(axis.options[0].vars)[0]
  const current = vars[primaryKey]
  const index = axis.options.findIndex((option) => option.vars[primaryKey] === current)
  return index === -1 ? axis.options.findIndex((option) => option.vars[primaryKey] === STYLE_DEFAULTS[primaryKey]) : index
}
