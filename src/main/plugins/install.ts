import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  COMMUNITY_PLUGINS_REPO,
  isPluginManifest,
  type InstalledPlugin,
  type PluginInstallResult,
  type PluginManifest
} from '@shared/pluginTypes'
import { loadInstalledPlugins, pluginDir, pluginIconUrl, saveInstalledPlugins } from './config'
import { writePluginShell } from './pluginShell'

const { owner: REPO_OWNER, name: REPO_NAME, branch: REPO_BRANCH } = COMMUNITY_PLUGINS_REPO

function rawUrl(folder: string, filename: string): string {
  return `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${REPO_BRANCH}/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`
}

/**
 * Installs one plugin from the community repo — re-fetches and
 * re-validates the manifest fresh rather than trusting whatever the
 * Store's cached CommunityPluginSummary said a moment earlier (a stale or
 * tampered cache shouldn't be able to sneak a different bundle in between
 * "the user reviewed this" and "this is what actually got installed"),
 * downloads the entry bundle, and records its SHA-256 hash so a future
 * launch can detect if the file on disk ever changes out from under an
 * already-installed plugin (see verifyInstalledBundle below, checked by
 * PluginHost.tsx before every mount, not just once here).
 */
export async function installPlugin(folder: string): Promise<PluginInstallResult> {
  let manifest: PluginManifest
  try {
    const manifestResponse = await fetch(rawUrl(folder, 'plugin.json'), { signal: AbortSignal.timeout(10000) })
    if (!manifestResponse.ok) {
      return { success: false, error: `Could not fetch plugin.json (${manifestResponse.status})`, plugin: null }
    }
    const parsed = JSON.parse(await manifestResponse.text())
    if (!isPluginManifest(parsed)) {
      return { success: false, error: 'plugin.json is malformed', plugin: null }
    }
    manifest = parsed
  } catch (error) {
    return {
      success: false,
      error: `Could not reach the plugin repo: ${error instanceof Error ? error.message : String(error)}`,
      plugin: null
    }
  }

  let bundleBytes: Buffer
  try {
    const bundleResponse = await fetch(rawUrl(folder, manifest.entry), { signal: AbortSignal.timeout(20000) })
    if (!bundleResponse.ok) {
      return { success: false, error: `Could not fetch ${manifest.entry} (${bundleResponse.status})`, plugin: null }
    }
    bundleBytes = Buffer.from(await bundleResponse.arrayBuffer())
  } catch (error) {
    return {
      success: false,
      error: `Could not download the plugin bundle: ${error instanceof Error ? error.message : String(error)}`,
      plugin: null
    }
  }

  const dir = pluginDir(manifest.id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'bundle.js'), bundleBytes)
  writeFileSync(join(dir, 'plugin.json'), JSON.stringify(manifest, null, 2))

  if (manifest.icon) {
    try {
      const iconResponse = await fetch(rawUrl(folder, manifest.icon), { signal: AbortSignal.timeout(10000) })
      if (iconResponse.ok) {
        writeFileSync(join(dir, manifest.icon), Buffer.from(await iconResponse.arrayBuffer()))
      }
    } catch {
      // Icon is cosmetic — a failed fetch shouldn't block the install itself.
    }
  }

  // Shell files are 100% fixed, main-process-authored content (see
  // pluginShell.ts) — written fresh on every install, never downloaded.
  writePluginShell(dir)

  const bundleSha256 = createHash('sha256').update(bundleBytes).digest('hex')
  const now = Date.now()
  const installedPlugin: InstalledPlugin = {
    manifest,
    installedAt: now,
    grantedAt: now,
    bundleSha256,
    iconUrl: pluginIconUrl(manifest.id, manifest)
  }

  const existing = loadInstalledPlugins().filter((p) => p.manifest.id !== manifest.id)
  saveInstalledPlugins([...existing, installedPlugin])

  return { success: true, error: null, plugin: installedPlugin }
}

export function uninstallPlugin(id: string): void {
  rmSync(pluginDir(id), { recursive: true, force: true })
  saveInstalledPlugins(loadInstalledPlugins().filter((p) => p.manifest.id !== id))
}

/** Re-hashes the bundle actually on disk against what was recorded at
 * install time — checked right before a plugin is ever mounted (see
 * PluginHost.tsx), not just once here. A mismatch means the file changed
 * after it was reviewed and installed, whether from disk corruption or
 * something more deliberate; either way this is the refusal point, not a
 * warning to click past. */
export function verifyInstalledBundle(plugin: InstalledPlugin): boolean {
  try {
    const bundlePath = join(pluginDir(plugin.manifest.id), 'bundle.js')
    if (!existsSync(bundlePath)) return false
    const bytes = readFileSync(bundlePath)
    return createHash('sha256').update(bytes).digest('hex') === plugin.bundleSha256
  } catch {
    return false
  }
}
