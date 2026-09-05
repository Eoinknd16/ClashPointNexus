import { execFileSync } from 'child_process'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { parseVdf, type VdfObject } from './vdf'

export interface InstalledApp {
  appId: string
  name: string
  installDir: string
  sizeOnDisk: number
  lastPlayed: number
  libraryPath: string
  updatePending: boolean
  /** 0-100 while Steam is actively fetching bytes for this app, null otherwise. */
  downloadProgressPercent: number | null
}

// ACF's StateFlags is a bitmask undocumented by Valve but well-established
// across community Steam-library tools (consistent enough across Steam
// client versions to rely on for a display-only "needs attention" signal —
// worst case here is a badge that's occasionally stale, not anything that
// affects actually playing a game).
const STATE_FLAG_UPDATE_REQUIRED = 0x2
const STATE_FLAG_DOWNLOADING = 0x80000

const DEFAULT_STEAM_PATH = 'C:\\Program Files (x86)\\Steam'

export function findSteamPath(): string | null {
  try {
    const output = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], {
      encoding: 'utf-8'
    })
    const match = output.match(/SteamPath\s+REG_SZ\s+(.+)/)
    if (match) return match[1].trim()
  } catch {
    // fall through to default path
  }
  return existsSync(DEFAULT_STEAM_PATH) ? DEFAULT_STEAM_PATH : null
}

function parseLibraryFolderPaths(vdfText: string): string[] {
  const root = parseVdf(vdfText)
  const foldersRoot = (root['libraryfolders'] ?? root) as VdfObject
  const paths: string[] = []

  for (const entry of Object.values(foldersRoot)) {
    if (typeof entry === 'string') continue
    const path = entry['path']
    if (typeof path === 'string') paths.push(path)
  }

  return paths
}

function parseAppManifest(vdfText: string, libraryPath: string): InstalledApp | null {
  const root = parseVdf(vdfText)
  const state = root['AppState']
  if (!state || typeof state === 'string') return null

  const stateFlags = Number(state['StateFlags'] ?? 0)
  const bytesToDownload = Number(state['BytesToDownload'] ?? 0)
  const bytesDownloaded = Number(state['BytesDownloaded'] ?? 0)
  const activelyDownloading =
    (stateFlags & STATE_FLAG_DOWNLOADING) !== 0 && bytesToDownload > 0 && bytesDownloaded < bytesToDownload

  return {
    appId: String(state['appid'] ?? ''),
    name: String(state['name'] ?? 'Unknown'),
    installDir: String(state['installdir'] ?? ''),
    sizeOnDisk: Number(state['SizeOnDisk'] ?? 0),
    lastPlayed: Number(state['LastPlayed'] ?? 0),
    libraryPath,
    updatePending: (stateFlags & STATE_FLAG_UPDATE_REQUIRED) !== 0,
    downloadProgressPercent: activelyDownloading ? Math.round((bytesDownloaded / bytesToDownload) * 100) : null
  }
}

/** Scans every registered Steam library folder for installed games via their appmanifest files. */
export function getInstalledGames(): InstalledApp[] {
  const steamPath = findSteamPath()
  if (!steamPath) return []

  const libraryFoldersVdf = join(steamPath, 'steamapps', 'libraryfolders.vdf')
  if (!existsSync(libraryFoldersVdf)) return []

  const libraryPaths = parseLibraryFolderPaths(readFileSync(libraryFoldersVdf, 'utf-8'))
  const games: InstalledApp[] = []

  for (const libraryPath of libraryPaths) {
    const steamappsDir = join(libraryPath, 'steamapps')
    if (!existsSync(steamappsDir)) continue

    let files: string[]
    try {
      files = readdirSync(steamappsDir)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue
      try {
        const manifest = parseAppManifest(readFileSync(join(steamappsDir, file), 'utf-8'), libraryPath)
        if (manifest) games.push(manifest)
      } catch {
        // skip unreadable/corrupt manifest
      }
    }
  }

  return games
}
