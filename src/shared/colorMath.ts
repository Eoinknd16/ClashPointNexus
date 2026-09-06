/** Theme colors are stored as "R G B" space-separated channels (0-255) —
 * see builtInThemes.ts for why. HSL is what the in-app color picker actually
 * manipulates (hue/saturation/lightness sliders are a much more intuitive
 * "fine tune" control than raw R/G/B), so these convert both ways. Pure math,
 * no Electron/DOM dependency — shared between the renderer (the color
 * picker) and the main process (theme-pack install, extracting accent
 * colors from a theme's own images). */
export interface Hsl {
  h: number
  s: number
  l: number
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rf = r / 255
  const gf = g / 255
  const bf = b / 255
  const max = Math.max(rf, gf, bf)
  const min = Math.min(rf, gf, bf)
  const l = (max + min) / 2

  if (max === min) return { h: 0, s: 0, l: l * 100 }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rf) h = (gf - bf) / d + (gf < bf ? 6 : 0)
  else if (max === gf) h = (bf - rf) / d + 2
  else h = (rf - gf) / d + 4
  h /= 6

  return { h: h * 360, s: s * 100, l: l * 100 }
}

export function rgbTripletToHsl(triplet: string): Hsl {
  const parts = triplet.trim().split(/\s+/).map(Number)
  const [r, g, b] = parts.length === 3 ? parts : [128, 128, 128]
  return rgbToHsl(r, g, b)
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
 * gradient/shadow strings to keep them matching. Tuned bright/neon per
 * explicit feedback that the previous, more subtle glow read as too muted —
 * a bright inner ring, a strong accent-colored glow, and a second, softer
 * halo in accent-2 for a two-tone neon look on every theme, built-in or
 * installed alike. */
export function deriveThemeVars(base: Record<string, string>): Record<string, string> {
  const accent = (base['--color-accent'] ?? '91 140 255').trim().replace(/\s+/g, ',')
  const accent2 = (base['--color-accent-2'] ?? '160 107 255').trim().replace(/\s+/g, ',')
  return {
    ...base,
    '--gradient-app-glow':
      `radial-gradient(ellipse 80% 60% at 15% -10%, rgba(${accent},0.2), transparent 60%), ` +
      `radial-gradient(ellipse 70% 50% at 100% 10%, rgba(${accent2},0.16), transparent 60%)`,
    '--gradient-accent': `linear-gradient(135deg, rgb(${accent}) 0%, rgb(${accent2}) 100%)`,
    '--shadow-focus':
      `0 0 0 3px rgba(${accent},0.9), 0 0 24px rgba(${accent},0.6), ` +
      `0 0 48px rgba(${accent2},0.35), 0 8px 20px rgba(0,0,0,0.5)`,
    '--shadow-panel': '-24px 0 60px rgba(0,0,0,0.5)'
  }
}

export interface ExtractedAccent {
  accent: string
  accent2: string
}

interface HueBucket {
  weight: number
  hueSum: number
  satSum: number
  lightSum: number
  count: number
}

const BUCKET_COUNT = 24 // 15 degrees of hue per bucket

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Picks a dominant, vivid hue out of a flat RGBA pixel buffer (any
 * ArrayLike<number> — a Buffer, Uint8Array/Uint8ClampedArray all work) and
 * turns it into an accent/accent-2 pair — used to auto-theme a pack from its
 * own hero/tile images when the pack's theme.json doesn't specify
 * --color-accent itself. Near-black, near-white, and low-saturation pixels
 * are excluded before bucketing (shadow/highlight/grey noise, not "the
 * color" of the image), and each hue bucket is weighted by both how often
 * it appears AND how saturated it is, so a small vivid object can outweigh
 * a large dull area. Returns null if there isn't enough colorful signal to
 * say anything meaningful (e.g. a near-greyscale or mostly-transparent
 * image) — the caller falls back to a fixed default in that case.
 */
export function extractAccentColorsFromRgba(data: ArrayLike<number>): ExtractedAccent | null {
  const buckets: HueBucket[] = Array.from({ length: BUCKET_COUNT }, () => ({
    weight: 0,
    hueSum: 0,
    satSum: 0,
    lightSum: 0,
    count: 0
  }))
  const pixelCount = Math.floor(data.length / 4)
  let sampled = 0

  for (let i = 0; i < pixelCount; i++) {
    const alpha = data[i * 4 + 3]
    if (alpha < 200) continue
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const { h, s, l } = rgbToHsl(r, g, b)
    if (l < 8 || l > 92 || s < 12) continue

    const bucketIndex = Math.floor(h / (360 / BUCKET_COUNT)) % BUCKET_COUNT
    const bucket = buckets[bucketIndex]
    bucket.count += 1
    bucket.hueSum += h
    bucket.satSum += s
    bucket.lightSum += l
    bucket.weight += s / 100
    sampled += 1
  }

  if (sampled < 20) return null

  let bestIndex = -1
  let bestWeight = 0
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].weight > bestWeight) {
      bestWeight = buckets[i].weight
      bestIndex = i
    }
  }
  if (bestIndex === -1) return null

  const best = buckets[bestIndex]
  const dominantHue = best.hueSum / best.count
  const accentSat = clamp(best.satSum / best.count, 55, 88)
  const accentLight = clamp(best.lightSum / best.count, 52, 68)

  return {
    accent: hslToRgbTriplet(dominantHue, accentSat, accentLight),
    accent2: hslToRgbTriplet((dominantHue + 35) % 360, accentSat, accentLight)
  }
}
