import { type ChildProcess, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { findStremioInstallDir } from './paths'

const LOCAL_SERVER_BASE = 'http://127.0.0.1:11470'
const STARTUP_POLL_ATTEMPTS = 12
const STARTUP_POLL_INTERVAL_MS = 500

let serverProcess: ChildProcess | null = null

export interface StremioServerStatus {
  available: boolean
  /** Why it isn't available — null whenever available is true. */
  reason: string | null
}

async function isServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_SERVER_BASE}/settings`, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

/** Starts Stremio's bundled streaming server if it isn't already running (e.g. the desktop app has it open).
 * Needed for any infoHash/torrent-based stream (most popular addons, e.g. Torrentio) — an addon-provided
 * direct URL stream doesn't need this at all. Returns *why* it failed, not just whether it did, since a
 * silent false here is indistinguishable from "no streams exist" otherwise — this is the single most
 * consequential failure point in the whole playback path. */
export async function ensureStremioServer(): Promise<StremioServerStatus> {
  if (await isServerRunning()) return { available: true, reason: null }
  if (serverProcess) return { available: false, reason: "Torrent server is still starting up — try again in a moment" }

  const installDir = findStremioInstallDir()
  if (!installDir) {
    return {
      available: false,
      reason: 'Stremio desktop app not found (its bundled torrent engine is what plays infoHash-based streams)'
    }
  }

  const runtimePath = join(installDir, 'stremio-runtime.exe')
  const serverScript = join(installDir, 'server.js')
  if (!existsSync(runtimePath) || !existsSync(serverScript)) {
    return { available: false, reason: `Stremio install found at ${installDir} but its runtime files are missing` }
  }

  serverProcess = spawn(runtimePath, [serverScript], {
    cwd: installDir,
    stdio: 'ignore',
    windowsHide: true
  })
  serverProcess.on('exit', () => {
    serverProcess = null
  })

  for (let attempt = 0; attempt < STARTUP_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, STARTUP_POLL_INTERVAL_MS))
    if (await isServerRunning()) return { available: true, reason: null }
  }
  return { available: false, reason: 'Torrent server did not respond within 6 seconds of starting' }
}

export function stopStremioServer(): void {
  serverProcess?.kill()
  serverProcess = null
}

export function localStreamUrl(infoHash: string, fileIdx: number): string {
  return `${LOCAL_SERVER_BASE}/${infoHash}/${fileIdx}`
}
