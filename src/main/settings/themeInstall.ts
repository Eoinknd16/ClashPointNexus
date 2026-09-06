import { basename, join } from 'path'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs'
import { pathToFileURL } from 'url'
import { deriveThemeVars } from '@shared/colorMath'
import type {
  ThemeDefinition,
  ThemeInstallResult,
  ThemePackManifest,
  ThemeScanResult
} from '@shared/themeTypes'
import { extractAccentColorsFromImage } from './imageColors'
import { loadCustomThemes, saveCustomThemes, themeAssetsRoot, themesDropRoot } from './themes'

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

export function isThemePackManifest(value: unknown): value is ThemePackManifest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (candidate.name !== undefined && (typeof candidate.name !== 'string' || !candidate.name.trim())) {
    return false
  }
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
export function slugifyToId(name: string): string {
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

function readPackManifest(folderPath: string): { manifest: ThemePackManifest } | { error: string } {
  const manifestPath = join(folderPath, MANIFEST_FILENAME)
  if (!existsSync(manifestPath)) {
    return { error: `No ${MANIFEST_FILENAME} found in this folder` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch {
    return { error: `${MANIFEST_FILENAME} is not valid JSON` }
  }
  if (!isThemePackManifest(parsed)) {
    return { error: `${MANIFEST_FILENAME} is malformed` }
  }
  return { manifest: parsed }
}

/** How buildInstalledTheme gets an asset's actual bytes onto disk at
 * theme-assets/<id>/<filename> — a local copy for a folder on this machine
 * (installThemeFromFolder, scanThemesDropFolder), or a download for a pack
 * living in the community repo (communityThemes.ts). Returns null if the
 * asset genuinely couldn't be obtained (missing locally, 404 remotely). */
export type AssetFetcher = (
  filename: string,
  assetsDir: string
) => { fileUrl: string; destPath: string } | null | Promise<{ fileUrl: string; destPath: string } | null>

/** AssetFetcher for a plain folder on this machine — install by copying. */
export function localAssetFetcher(folderPath: string): AssetFetcher {
  return (filename, assetsDir) => {
    const sourcePath = join(folderPath, filename)
    if (!existsSync(sourcePath)) return null
    const destPath = join(assetsDir, filename)
    copyFileSync(sourcePath, destPath)
    return { fileUrl: pathToFileURL(destPath).toString(), destPath }
  }
}

/**
 * Fetches a pack's referenced images into theme-assets/<id>/ (however
 * fetchAsset gets them there) and builds the resulting ThemeDefinition,
 * auto-extracting accent colors from the pack's own imagery when its
 * manifest doesn't specify them. Doesn't touch themes.config.json itself —
 * id/name are decided by the caller, since that differs between a manual
 * File Manager install (de-duplicated, manifest name wins), a Themes-folder
 * scan, and a community-repo install (both of the latter: deterministic
 * from folder name).
 */
export async function buildInstalledTheme(
  manifest: ThemePackManifest,
  id: string,
  name: string,
  fetchAsset: AssetFetcher
): Promise<{ theme: ThemeDefinition } | { error: string }> {
  const assetsDir = join(themeAssetsRoot(), id)
  mkdirSync(assetsDir, { recursive: true })

  let heroImage: string | undefined
  let heroImageDestPath: string | undefined
  if (manifest.heroImage) {
    const copied = await fetchAsset(manifest.heroImage, assetsDir)
    if (!copied) {
      rmSync(assetsDir, { recursive: true, force: true })
      return { error: `heroImage "${manifest.heroImage}" not found` }
    }
    heroImage = copied.fileUrl
    heroImageDestPath = copied.destPath
  }

  let tileImages: Record<string, string> | undefined
  let firstTileImageDestPath: string | undefined
  if (manifest.tileImages) {
    tileImages = {}
    for (const [tileId, filename] of Object.entries(manifest.tileImages)) {
      const copied = await fetchAsset(filename, assetsDir)
      if (!copied) {
        rmSync(assetsDir, { recursive: true, force: true })
        return { error: `tileImages.${tileId} ("${filename}") not found` }
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
    name,
    vars: deriveThemeVars(baseVars),
    ...(heroImage ? { heroImage } : {}),
    ...(tileImages ? { tileImages } : {})
  }
  return { theme }
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
 * The pack's display name comes from theme.json's own "name" field, falling
 * back to the folder's own name if that's omitted. (For the Themes drop
 * folder's automatic scan, see scanThemesDropFolder instead — there the
 * folder name always wins, even over an explicit "name".)
 */
export async function installThemeFromFolder(folderPath: string): Promise<ThemeInstallResult> {
  const read = readPackManifest(folderPath)
  if ('error' in read) return { success: false, error: read.error, theme: null }

  const existing = loadCustomThemes()
  const name = read.manifest.name?.trim() || basename(folderPath)
  const id = uniqueId(slugifyToId(name), new Set(existing.map((t) => t.id)))

  const built = await buildInstalledTheme(read.manifest, id, name, localAssetFetcher(folderPath))
  if ('error' in built) return { success: false, error: built.error, theme: null }

  saveCustomThemes([...existing, built.theme])
  return { success: true, error: null, theme: built.theme }
}

/**
 * Scans the Themes drop folder (themesDropRoot) for pack subfolders and
 * installs any that aren't already installed — run once at every app
 * startup, and again on demand via Settings' "Rescan Themes Folder" action,
 * so dropping a ready-made pack folder into Explorer is enough on its own;
 * no in-app File Manager step needed.
 *
 * The folder's own name always becomes the theme's display name here —
 * theme.json's "name" field, even if present, is ignored — since renaming
 * the folder to rename the theme is the whole point of organizing packs
 * this way. The id is derived deterministically from that same folder name
 * rather than de-duplicated like installThemeFromFolder's uniqueId, so
 * re-scanning a folder that's already installed is a silent no-op instead
 * of installing a second copy or re-deriving (and clobbering) colors the
 * user has since fine-tuned in-app for it — this runs unattended on every
 * launch, so it must never touch an already-installed pack.
 */
export async function scanThemesDropFolder(): Promise<ThemeScanResult> {
  const root = themesDropRoot()
  mkdirSync(root, { recursive: true })

  const existing = loadCustomThemes()
  const existingIds = new Set(existing.map((t) => t.id))
  const installed: string[] = []
  const errors: Array<{ folder: string; error: string }> = []
  const nextThemes = [...existing]

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const folderName = entry.name
    const id = slugifyToId(folderName)
    if (existingIds.has(id)) continue

    const folderPath = join(root, folderName)
    const read = readPackManifest(folderPath)
    if ('error' in read) {
      errors.push({ folder: folderName, error: read.error })
      continue
    }

    const built = await buildInstalledTheme(read.manifest, id, folderName, localAssetFetcher(folderPath))
    if ('error' in built) {
      errors.push({ folder: folderName, error: built.error })
      continue
    }

    nextThemes.push(built.theme)
    existingIds.add(id)
    installed.push(folderName)
  }

  if (installed.length > 0) saveCustomThemes(nextThemes)
  return { installed, errors }
}

/** Reached from Settings' "Remove Theme" action. Only ever deletes this
 * app's own copied assets, not whatever the pack's original source was —
 * a folder still sitting in the Themes drop folder will reinstall on the
 * next scan unless it's also removed/renamed there. */
export function removeInstalledTheme(id: string): void {
  const existing = loadCustomThemes()
  saveCustomThemes(existing.filter((t) => t.id !== id))
  rmSync(join(themeAssetsRoot(), id), { recursive: true, force: true })
}
