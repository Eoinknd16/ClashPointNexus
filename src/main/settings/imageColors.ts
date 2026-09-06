import { Jimp } from 'jimp'
import { extractAccentColorsFromRgba, type ExtractedAccent } from '@shared/colorMath'

// Downscaled before sampling — a theme pack's hero image can be a genuinely
// large photo, and the dominant-hue bucketing only needs a representative
// sample, not every pixel. jimp is pure JS (no native binary, unlike sharp),
// which is exactly why it's usable at all here: this runs in the main
// process of a packaged Electron app, where a native module would need a
// prebuilt binary matching this exact Electron version's ABI.
const SAMPLE_SIZE = 48

/** Reads an image file and picks an accent/accent-2 pair from its dominant
 * vivid hue — see colorMath.ts's extractAccentColorsFromRgba for the actual
 * algorithm. Returns null on any failure (unreadable/corrupt file, or not
 * enough color signal to say anything meaningful) rather than throwing —
 * this is always a best-effort enhancement on top of a theme pack that
 * still installs fine without it. */
export async function extractAccentColorsFromImage(imagePath: string): Promise<ExtractedAccent | null> {
  try {
    const image = await Jimp.read(imagePath)
    image.resize({ w: SAMPLE_SIZE, h: SAMPLE_SIZE })
    return extractAccentColorsFromRgba(image.bitmap.data)
  } catch {
    return null
  }
}
