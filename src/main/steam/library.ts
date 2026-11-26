import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { readFile, readdir } from 'fs/promises'
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

// Cached for the whole session: Steam's install path doesn't move while
// Nexus is running, and this used to be a *synchronous* `reg.exe` spawn
// (execFileSync) run several times per Home load -- getSteamLibrary called
// it twice and Home calls getSteamLibrary twice. A sync spawn blocks
// Electron's main process, which is the same thread that forwards input
// and presents frames for the window, so every one of those was a visible
// UI freeze -- worst on a cold boot, when reg.exe itself isn't in the OS
// file cache yet and Defender scans it on first launch. Async + cached
// means at most one reg query per session, off the UI thread.
let steamPathPromise: Promise<string | null> | null = null

export function findSteamPath(): Promise<string | null> {
  if (!steamPathPromise) {
    steamPathPromise = new Promise((resolve) => {
      execFile(
        'reg',
        ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
        { encoding: 'utf-8', windowsHide: true },
        (error, stdout) => {
          const match = !error ? stdout.match(/SteamPath\s+REG_SZ\s+(.+)/) : null
          if (match) resolve(match[1].trim())
          else resolve(existsSync(DEFAULT_STEAM_PATH) ? DEFAULT_STEAM_PATH : null)
        }
      )
    })
    // Don't cache a miss forever -- Steam may get installed mid-session.
    void steamPathPromise.then((path) => {
      if (!path) steamPathPromise = null
    })
  }
  return steamPathPromise
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

/** Scans every registered Steam library folder for installed games via
 * their appmanifest files. Fully async: on a big library spread across
 * several drives this is hundreds of file reads, and doing them with
 * readFileSync (as it used to) stalled the main process -- and therefore
 * the whole window -- for as long as the slowest drive took to spin up. */
export async function getInstalledGames(): Promise<InstalledApp[]> {
  const steamPath = await findSteamPath()
  if (!steamPath) return []

  const libraryFoldersVdf = join(steamPath, 'steamapps', 'libraryfolders.vdf')
  let libraryPaths: string[]
  try {
    libraryPaths = parseLibraryFolderPaths(await readFile(libraryFoldersVdf, 'utf-8'))
  } catch {
    return []
  }

  const perLibrary = await Promise.all(
    libraryPaths.map(async (libraryPath): Promise<InstalledApp[]> => {
      const steamappsDir = join(libraryPath, 'steamapps')
      let files: string[]
      try {
        files = await readdir(steamappsDir)
      } catch {
        return []
      }
      const manifests = await Promise.all(
        files
          .filter((file) => file.startsWith('appmanifest_') && file.endsWith('.acf'))
          .map(async (file) => {
            try {
              return parseAppManifest(await readFile(join(steamappsDir, file), 'utf-8'), libraryPath)
            } catch {
              return null // skip unreadable/corrupt manifest
            }
          })
      )
      return manifests.filter((m): m is InstalledApp => m !== null)
    })
  )

  return perLibrary.flat()
}
