import { app } from 'electron'
import { basename, join } from 'path'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import type { ThemePackManifest, ThemeSubmissionResult } from '@shared/themeTypes'
import { loadCustomThemes } from './themes'

/** The 7 base colors a custom theme's vars actually define by hand — the
 * rest (--gradient-app-glow etc.) are mechanically derived on install (see
 * themeInstall.ts's deriveThemeVars call), so a submission's theme.json only
 * ever needs to carry these, same contract as any other theme pack. */
const BASE_COLOR_KEYS = [
  '--color-bg',
  '--color-surface',
  '--color-surface-hi',
  '--color-surface-hover',
  '--color-accent',
  '--color-accent-2',
  '--color-muted'
]

function themeExportsRoot(): string {
  const isDev = !app.isPackaged
  return isDev ? join(process.cwd(), 'ThemeExports') : join(app.getPath('userData'), 'ThemeExports')
}

/** Sanitizes a theme's display name into a real folder name — this becomes
 * the submission's identity in the community repo (folder name IS the
 * theme name there, see communityThemes.ts), so it has to survive being an
 * actual path, not just look nice. */
function sanitizeFolderName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || 'My Theme'
}

/**
 * Packages a custom/installed theme's colors + images into a plain folder
 * shaped exactly like a Themes drop-folder pack — the user then uploads
 * that folder to the community repo themselves (GitHub's web "Add file"
 * upload, or a PR if they're comfortable with git), which is the actual
 * moderation step for that system; this never touches GitHub itself, only
 * the local filesystem.
 *
 * Only meaningful for custom/installed themes (loadCustomThemes) — a
 * built-in's images, if it has any, are bundled renderer assets rather than
 * real files on disk this process could copy, and built-ins are meant to
 * only ever be edited in the project's own source anyway.
 */
export function prepareThemeSubmission(id: string): ThemeSubmissionResult {
  const theme = loadCustomThemes().find((t) => t.id === id)
  if (!theme) return { success: false, error: 'Not a custom/installed theme', exportPath: null }

  const exportDir = join(themeExportsRoot(), sanitizeFolderName(theme.name))
  mkdirSync(exportDir, { recursive: true })

  function copyFromFileUrl(fileUrl: string): string | null {
    try {
      const sourcePath = fileURLToPath(fileUrl)
      if (!existsSync(sourcePath)) return null
      const filename = basename(sourcePath)
      copyFileSync(sourcePath, join(exportDir, filename))
      return filename
    } catch {
      return null
    }
  }

  const manifest: ThemePackManifest = {
    vars: Object.fromEntries(BASE_COLOR_KEYS.filter((key) => theme.vars[key]).map((key) => [key, theme.vars[key]]))
  }

  if (theme.heroImage) {
    const filename = copyFromFileUrl(theme.heroImage)
    if (filename) manifest.heroImage = filename
  }
  if (theme.tileImages) {
    const tileImages: Record<string, string> = {}
    for (const [tileId, url] of Object.entries(theme.tileImages)) {
      const filename = copyFromFileUrl(url)
      if (filename) tileImages[tileId] = filename
    }
    if (Object.keys(tileImages).length > 0) manifest.tileImages = tileImages
  }

  writeFileSync(join(exportDir, 'theme.json'), JSON.stringify(manifest, null, 2))
  return { success: true, error: null, exportPath: exportDir }
}
