import { join } from 'path'
import { writeFileSync } from 'fs'
import { pathToFileURL } from 'url'
import {
  COMMUNITY_THEMES_REPO,
  type CommunityThemeSummary,
  type ThemeInstallResult,
  type ThemePackManifest
} from '@shared/themeTypes'
import { buildInstalledTheme, isThemePackManifest, slugifyToId, type AssetFetcher } from './themeInstall'
import { loadCustomThemes, saveCustomThemes } from './themes'

const { owner: REPO_OWNER, name: REPO_NAME, branch: REPO_BRANCH } = COMMUNITY_THEMES_REPO
const MANIFEST_FILENAME = 'theme.json'

function rawUrl(folder: string, filename: string): string {
  return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`
}

async function fetchManifest(folder: string): Promise<ThemePackManifest | null> {
  try {
    const response = await fetch(rawUrl(folder, MANIFEST_FILENAME))
    if (!response.ok) return null
    const parsed = JSON.parse(await response.text())
    return isThemePackManifest(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Lists every theme pack folder in the public community repo — there's no
 * server of our own here, just a GitHub repo the user reviews and merges
 * submissions into (see themeSubmission.ts for the "prepare a submission"
 * side); this only ever reads it anonymously. Best-effort throughout: an
 * unreachable repo, an empty one, or one bad folder just means it (or that
 * one entry) is missing from the list, never a crash.
 */
export async function listCommunityThemes(): Promise<CommunityThemeSummary[]> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/`)
    if (!response.ok) return []
    const entries = (await response.json()) as unknown
    if (!Array.isArray(entries)) return []
    const folders = entries.filter(
      (e): e is { name: string; type: string } =>
        !!e && typeof e === 'object' && (e as { type?: unknown }).type === 'dir'
    )

    const summaries = await Promise.all(
      folders.map(async (folder): Promise<CommunityThemeSummary | null> => {
        const manifest = await fetchManifest(folder.name)
        if (!manifest) return null
        const previewFilename = manifest.heroImage ?? Object.values(manifest.tileImages ?? {})[0]
        return {
          folder: folder.name,
          name: folder.name,
          previewUrl: previewFilename ? rawUrl(folder.name, previewFilename) : null
        }
      })
    )
    return summaries.filter((s): s is CommunityThemeSummary => s !== null)
  } catch {
    return []
  }
}

function remoteAssetFetcher(folder: string): AssetFetcher {
  return async (filename, assetsDir) => {
    try {
      const response = await fetch(rawUrl(folder, filename))
      if (!response.ok) return null
      const buffer = Buffer.from(await response.arrayBuffer())
      const destPath = join(assetsDir, filename)
      writeFileSync(destPath, buffer)
      return { fileUrl: pathToFileURL(destPath).toString(), destPath }
    } catch {
      return null
    }
  }
}

/**
 * Installs one theme from the community repo — id is deterministic from
 * the folder name (same as the local Themes drop folder), so re-picking an
 * already-installed one from the Store's Community row is a no-op rather
 * than a duplicate or a re-download.
 */
export async function installCommunityTheme(folder: string): Promise<ThemeInstallResult> {
  const existing = loadCustomThemes()
  const id = slugifyToId(folder)
  const already = existing.find((t) => t.id === id)
  if (already) return { success: true, error: null, theme: already }

  const manifest = await fetchManifest(folder)
  if (!manifest) {
    return { success: false, error: 'Could not read this theme from the community repo', theme: null }
  }

  const built = await buildInstalledTheme(manifest, id, folder, remoteAssetFetcher(folder))
  if ('error' in built) return { success: false, error: built.error, theme: null }

  saveCustomThemes([...existing, built.theme])
  return { success: true, error: null, theme: built.theme }
}
