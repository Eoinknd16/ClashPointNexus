import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AddonSummary } from '@shared/stremioTypes'

export interface StremioConfig {
  /** Every addon from your Stremio account (or manually added) — same set as the real app. */
  addons: AddonSummary[]
  authKey?: string
  email?: string
}

const DEFAULT_CONFIG: StremioConfig = { addons: [] }

function configPath(): string {
  const isDev = !app.isPackaged
  return isDev
    ? join(process.cwd(), 'stremio.config.json')
    : join(app.getPath('userData'), 'stremio.config.json')
}

function deriveNameFromUrl(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Migrates older config shapes (plain string URLs, or {name,url} without resources) — real data arrives on next account re-sync. */
function normalizeAddons(raw: unknown): AddonSummary[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry): AddonSummary | null => {
      if (typeof entry === 'string') {
        return { name: deriveNameFromUrl(entry), url: entry, resources: ['stream'] }
      }
      if (entry && typeof entry === 'object' && 'url' in entry) {
        const obj = entry as Pick<AddonSummary, 'name' | 'url' | 'resources' | 'catalogs'> & {
          name?: string
          resources?: string[]
        }
        return {
          name: obj.name ?? deriveNameFromUrl(obj.url),
          url: obj.url,
          resources: obj.resources ?? ['stream'],
          catalogs: obj.catalogs
        }
      }
      return null
    })
    .filter((entry): entry is AddonSummary => entry !== null)
}

/** Reads stremio.config.json (project root in dev, userData once packaged), seeding a blank file if missing. */
export function loadStremioConfig(): StremioConfig {
  const path = configPath()
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify(DEFAULT_CONFIG, null, 2))
    return DEFAULT_CONFIG
  }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    // "addons" is current; "streamAddons" is the older key name pre-dating full-collection sync.
    const addonsRaw = raw.addons ?? raw.streamAddons
    return { ...DEFAULT_CONFIG, ...raw, addons: normalizeAddons(addonsRaw) }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveStremioConfig(config: StremioConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2))
}
