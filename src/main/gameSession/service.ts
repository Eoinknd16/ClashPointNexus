import { execFile, type ChildProcess } from 'child_process'
import { app, type BrowserWindow } from 'electron'
import { isHiddenForDesktop } from '../globalInput/ipc'

const isDev = (): boolean => !app.isPackaged
const STEAM_POLL_INTERVAL_MS = 3000

function hideNexusWindow(mainWindow: BrowserWindow): void {
  if (mainWindow.isDestroyed()) return
  if (!isDev()) mainWindow.setFullScreen(false)
  mainWindow.minimize()
}

function restoreNexusWindow(mainWindow: BrowserWindow): void {
  if (mainWindow.isDestroyed()) return
  // Respects an explicit "Show Desktop" the user made while the game was
  // running instead of yanking Nexus back over whatever they're doing —
  // they still have every existing way (PS click, Show Desktop again) to
  // bring it back forward whenever they actually want to.
  if (isHiddenForDesktop()) return
  mainWindow.restore()
  if (!isDev()) mainWindow.setFullScreen(true)
  mainWindow.focus()
}

/**
 * Shared by both launch paths (Steam and generic apps, see steam/ipc.ts and
 * apps/ipc.ts) — hides Nexus, awaits however the caller determines the
 * session is over, then restores it. Fire-and-forget from the IPC handler's
 * own point of view: the renderer only needs to know the launch itself
 * started OK, not sit waiting for the whole play session to finish.
 */
export async function runGameSession(mainWindow: BrowserWindow, waitForExit: Promise<void>): Promise<void> {
  hideNexusWindow(mainWindow)
  await waitForExit
  restoreNexusWindow(mainWindow)
}

/** A spawned child's own 'exit'. Good enough for most simple executables
 * added via the Apps registry, but not bulletproof: some games/launchers
 * spawn a stub process that exits within seconds while the real game
 * process keeps running under a different PID (common with anti-cheat or
 * engine-specific launcher wrappers) — Nexus would restore itself early in
 * that case. Steam games avoid this entirely via waitForSteamAppExit below,
 * since Steam itself tracks the real game's lifecycle regardless of any
 * launcher stub in between. */
export function waitForChildExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    child.once('exit', () => resolve())
  })
}

function isSteamAppRunning(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('reg', ['query', `HKCU\\Software\\Valve\\Steam\\Apps\\${id}`, '/v', 'Running'], (error, stdout) => {
      // A query error just means the key/value doesn't exist yet (Steam
      // hasn't touched this app this session) or is already gone — either
      // way, not currently running, not a real failure worth surfacing.
      if (error) {
        resolve(false)
        return
      }
      resolve(/Running\s+REG_DWORD\s+0x1\b/i.test(stdout))
    })
  })
}

/**
 * Polls Steam's own per-app "Running" registry flag — the same mechanism
 * its own overlay/friends-status uses — rather than guessing at process
 * names. Deliberately waits to actually observe Running=1 at least once
 * before treating a later Running=0 as a real exit, rather than assuming
 * any fixed "Steam should have started it by now" grace period: a slow
 * install/update or an update-confirmation prompt the user hasn't dismissed
 * yet would otherwise look identical to "already exited" and restore Nexus
 * over Steam's own dialog. No overall timeout either — if the user never
 * actually starts the game (backs out of Steam's prompt entirely), this
 * just keeps polling quietly in the background; every existing way of
 * bringing Nexus forward (PS click, Show Desktop) still works regardless
 * of this loop's state.
 */
export async function waitForSteamAppExit(id: string): Promise<void> {
  let sawRunning = false
  for (;;) {
    const running = await isSteamAppRunning(id)
    if (running) sawRunning = true
    else if (sawRunning) return
    await new Promise((resolve) => setTimeout(resolve, STEAM_POLL_INTERVAL_MS))
  }
}
