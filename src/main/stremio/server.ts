import { type ChildProcess, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { findStremioInstallDir } from './paths'

const LOCAL_SERVER_BASE = 'http://127.0.0.1:11470'
const STARTUP_POLL_ATTEMPTS = 12
const STARTUP_POLL_INTERVAL_MS = 500

let serverProcess: ChildProcess | null = null

async function isServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_SERVER_BASE}/settings`, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

/** Starts Stremio's bundled streaming server if it isn't already running (e.g. the desktop app has it open). */
export async function ensureStremioServer(): Promise<boolean> {
  if (await isServerRunning()) return true
  if (serverProcess) return false // already spawned, still starting up

  const installDir = findStremioInstallDir()
  if (!installDir) return false

  const runtimePath = join(installDir, 'stremio-runtime.exe')
  const serverScript = join(installDir, 'server.js')
  if (!existsSync(runtimePath) || !existsSync(serverScript)) return false

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
    if (await isServerRunning()) return true
  }
  return false
}

export function stopStremioServer(): void {
  serverProcess?.kill()
  serverProcess = null
}

export function localStreamUrl(infoHash: string, fileIdx: number): string {
  return `${LOCAL_SERVER_BASE}/${infoHash}/${fileIdx}`
}
