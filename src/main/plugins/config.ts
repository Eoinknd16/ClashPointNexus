import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type { InstalledPlugin, PluginManifest } from '@shared/pluginTypes'

interface PluginsConfig {
  installed: InstalledPlugin[]
}

const DEFAULT_CONFIG: PluginsConfig = { installed: [] }

function configPath(): string {
  const isDev = !app.isPackaged
  return isDev ? join(process.cwd(), 'plugins.config.json') : join(app.getPath('userData'), 'plugins.config.json')
}

/** Where an installed plugin's own downloaded files (its manifest, bundle,
 * and generated shell — see pluginShell.ts) actually live, one folder per
 * plugin id. Kept separate from the config file itself (which only records
 * *that* something's installed and what it was granted) so re-installing
 * or uninstalling is just files-plus-one-JSON-entry, the same shape every
 * other install flow in this app (themes, apps) already uses. */
export function pluginFilesRoot(): string {
  const isDev = !app.isPackaged
  return isDev ? join(process.cwd(), 'plugin-files') : join(app.getPath('userData'), 'Plugins')
}

export function pluginDir(id: string): string {
  return join(pluginFilesRoot(), id)
}

/** file:// URL to a plugin's own downloaded icon, or null — the icon file
 * itself lives at pluginDir(id)/<manifest.icon>, written alongside the
 * bundle at install time (see install.ts). Recomputed here rather than
 * trusted from a saved config file so it can never point at a stale path
 * (e.g. a dev vs. packaged userData root) or a file that's since vanished. */
export function pluginIconUrl(id: string, manifest: PluginManifest): string | null {
  if (!manifest.icon) return null
  const path = join(pluginDir(id), manifest.icon)
  return existsSync(path) ? pathToFileURL(path).toString() : null
}

export function loadInstalledPlugins(): InstalledPlugin[] {
  const path = configPath()
  if (!existsSync(path)) return []
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    const installed: InstalledPlugin[] = Array.isArray(raw?.installed) ? raw.installed : []
    return installed.map((p) => ({ ...p, iconUrl: pluginIconUrl(p.manifest.id, p.manifest) }))
  } catch {
    return []
  }
}

export function saveInstalledPlugins(installed: InstalledPlugin[]): void {
  writeFileSync(configPath(), JSON.stringify({ installed } satisfies PluginsConfig, null, 2))
}
