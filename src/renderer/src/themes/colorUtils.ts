/** Theme colors are stored as "R G B" space-separated channels (0-255) —
 * see builtInThemes.ts for why. HSL is what the in-app color picker actually
 * manipulates (hue/saturation/lightness sliders are a much more intuitive
 * "fine tune" control than raw R/G/B), so these convert both ways. */
export interface Hsl {
  h: number
  s: number
  l: number
}

export function rgbTripletToHsl(triplet: string): Hsl {
  const parts = triplet
    .trim()
    .split(/\s+/)
    .map((n) => Number(n) / 255)
  const [r, g, b] = parts.length === 3 ? parts : [0.5, 0.5, 0.5]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return { h: 0, s: 0, l: l * 100 }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h /= 6

  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hueToRgbChannel(p: number, q: number, tIn: number): number {
  let t = tIn
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

export function hslToRgbTriplet(hIn: number, sIn: number, lIn: number): string {
  const h = hIn / 360
  const s = sIn / 100
  const l = lIn / 100

  let r: number
  let g: number
  let b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hueToRgbChannel(p, q, h + 1 / 3)
    g = hueToRgbChannel(p, q, h)
    b = hueToRgbChannel(p, q, h - 1 / 3)
  }

  return `${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}`
}

/** --gradient-app-glow, --gradient-accent, --shadow-focus, and --shadow-panel
 * are all mechanically derivable from the 7 base colors (the built-in themes
 * are all built this way — see builtInThemes.ts) — the color picker only
 * ever touches the 7 base swatches and regenerates these afterward, so a
 * user fine-tuning "Accent" doesn't also need to hand-edit three raw CSS
 * gradient/shadow strings to keep them matching. */
export function deriveThemeVars(base: Record<string, string>): Record<string, string> {
  const accent = (base['--color-accent'] ?? '91 140 255').trim().replace(/\s+/g, ',')
  const accent2 = (base['--color-accent-2'] ?? '160 107 255').trim().replace(/\s+/g, ',')
  return {
    ...base,
    '--gradient-app-glow':
      `radial-gradient(ellipse 80% 60% at 15% -10%, rgba(${accent},0.16), transparent 60%), ` +
      `radial-gradient(ellipse 70% 50% at 100% 10%, rgba(${accent2},0.12), transparent 60%)`,
    '--gradient-accent': `linear-gradient(135deg, rgb(${accent}) 0%, rgb(${accent2}) 100%)`,
    '--shadow-focus':
      `0 0 0 3px rgba(${accent},0.6), 0 0 18px rgba(${accent},0.22), ` + `0 8px 20px rgba(0,0,0,0.45)`,
    '--shadow-panel': '-24px 0 60px rgba(0,0,0,0.5)'
  }
}
