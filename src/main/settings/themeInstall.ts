import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { deriveThemeVars } from '@shared/colorMath'
import type { ThemeDefinition, ThemeInstallResult, ThemePackManifest } from '@shared/themeTypes'
import { extractAccentColorsFromImage } from './imageColors'
import { loadCustomThemes, saveCustomThemes, themeAssetsRoot } from './themes'

const MANIFEST_FILENAME = 'theme.json'

/** Applied whenever a pack's theme.json doesn't specify its own vars at all
 * (or omits --color-accent/--color-accent-2 specifically) — sensible dark-UI
 * neutrals matching the built-in Midnight theme, so a minimal-effort pack
 * (just images, barely any JSON) still looks like a real theme rather than
 * an unstyled mess. Only the two accent colors ever get auto-extracted from
 * the pack's own images; the neutrals stay fixed since a wildly light/dark
 * background auto-picked from a photo risks real readability problems. */
const DEFAULT_BASE_VARS: Record<string, string> = {
  '--color-bg': '10 10 16',
  '--color-surface': '21 21 31',
  '--color-surface-hi': '30 30 44',
  '--color-surface-hover': '38 38 58',
  '--color-accent': '91 140 255',
  '--color-accent-2': '160 107 255',
  '--color-muted': '143 143 163'
}

function isThemePackManifest(value: unknown): value is ThemePackManifest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.name !== 'string' || !candidate.name.trim()) return false
  if (candidate.vars !== undefined && (typeof candidate.vars !== 'object' || candidate.vars === null)) {
    return false
  }
  if (candidate.heroImage !== undefined && typeof candidate.heroImage !== 'string') return false
  if (candidate.tileImages !== undefined) {
    if (typeof candidate.tileImages !== 'object' || candidate.tileImages === null) return false
    if (Object.values(candidate.tileImages).some((v) => typeof v !== 'string')) return false
  }
  return true
}

/** "My Cool Pack" -> "pack-my-cool-pack" — the pack- prefix keeps installed
 * theme ids structurally unable to collide with the built-in ids (plain
 * "midnight"/"crimson"/etc.), which live in the renderer and aren't
 * reachable from here to check against directly. */
function slugifyToId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `pack-${slug || 'theme'}`
}

function uniqueId(baseId: string, existingIds: Set<string>): string {
  if (!existingIds.has(baseId)) return baseId
  let n = 2
  while (existingIds.has(`${baseId}-${n}`)) n++
  return `${baseId}-${n}`
}

/**
 * Installs a theme pack from a plain folder (theme.json + whatever image
 * files it references, all relative to that same folder) — reached from the
 * File Manager's "Install as Theme" context action, not a native OS file
 * dialog, since a native dialog isn't controller-navigable and this whole
 * app is built to never need a mouse. Copies every referenced image into
 * this app's own userData/theme-assets/<id>/ folder rather than referencing
 * the source folder live, so the pack keeps working even if the user later
 * moves or deletes wherever they originally unpacked it from.
 *
 * If the pack's theme.json doesn't specify --color-accent/--color-accent-2
 * itself, they're auto-extracted from the pack's own heroImage (or its first
 * tileImage if there's no hero) — a real user asked for exactly this rather
 * than needing to hand-pick complementary colors for every pack.
 */
export async function installThemeFromFolder(folderPath: string): Promise<ThemeInstallResult> {
  const manifestPath = join(folderPath, MANIFEST_FILENAME)
  if (!existsSync(manifestPath)) {
    return { success: false, error: `No ${MANIFEST_FILENAME} found in this folder`, theme: null }
  }

  let manifest: unknown
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch {
    return { success: false, error: `${MANIFEST_FILENAME} is not valid JSON`, theme: null }
  }
  if (!isThemePackManifest(manifest)) {
    return { success: false, error: `${MANIFEST_FILENAME} is missing a name, or malformed`, theme: null }
  }

  const existing = loadCustomThemes()
  const id = uniqueId(
    slugifyToId(manifest.name),
    new Set(existing.map((t) => t.id))
  )
  const assetsDir = join(themeAssetsRoot(), id)
  mkdirSync(assetsDir, { recursive: true })

  function copyAsset(filename: string): { fileUrl: string; destPath: string } | null {
    const sourcePath = join(folderPath, filename)
    if (!existsSync(sourcePath)) return null
    const destPath = join(assetsDir, filename)
    copyFileSync(sourcePath, destPath)
    return { fileUrl: pathToFileURL(destPath).toString(), destPath }
  }

  let heroImage: string | undefined
  let heroImageDestPath: string | undefined
  if (manifest.heroImage) {
    const copied = copyAsset(manifest.heroImage)
    if (!copied) {
      rmSync(assetsDir, { recursive: true, force: true })
      return { success: false, error: `heroImage "${manifest.heroImage}" not found in this folder`, theme: null }
    }
    heroImage = copied.fileUrl
    heroImageDestPath = copied.destPath
  }

  let tileImages: Record<string, string> | undefined
  let firstTileImageDestPath: string | undefined
  if (manifest.tileImages) {
    tileImages = {}
    for (const [tileId, filename] of Object.entries(manifest.tileImages)) {
      const copied = copyAsset(filename)
      if (!copied) {
        rmSync(assetsDir, { recursive: true, force: true })
        return {
          success: false,
          error: `tileImages.${tileId} ("${filename}") not found in this folder`,
          theme: null
        }
      }
      tileImages[tileId] = copied.fileUrl
      firstTileImageDestPath ??= copied.destPath
    }
  }

  const manifestVars = manifest.vars ?? {}
  let baseVars: Record<string, string> = { ...DEFAULT_BASE_VARS, ...manifestVars }

  if (!manifestVars['--color-accent'] || !manifestVars['--color-accent-2']) {
    const sourceImage = heroImageDestPath ?? firstTileImageDestPath
    const extracted = sourceImage ? await extractAccentColorsFromImage(sourceImage) : null
    if (extracted) {
      baseVars = {
        ...baseVars,
        '--color-accent': manifestVars['--color-accent'] ?? extracted.accent,
        '--color-accent-2': manifestVars['--color-accent-2'] ?? extracted.accent2
      }
    }
  }

  const theme: ThemeDefinition = {
    id,
    name: manifest.name,
    vars: deriveThemeVars(baseVars),
    ...(heroImage ? { heroImage } : {}),
    ...(tileImages ? { tileImages } : {})
  }

  saveCustomThemes([...existing, theme])
  return { success: true, error: null, theme }
}

/** No UI wired to this yet — custom themes (and now theme packs) can still
 * only be removed by hand-editing themes.config.json, same as before this
 * feature existed. Exists so that path at least cleans up copied assets
 * properly once a removal UI is worth building. */
export function removeInstalledTheme(id: string): void {
  const existing = loadCustomThemes()
  saveCustomThemes(existing.filter((t) => t.id !== id))
  rmSync(join(themeAssetsRoot(), id), { recursive: true, force: true })
}
