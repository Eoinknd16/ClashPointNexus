import { spawn, type ChildProcess } from 'child_process'
import { dirname } from 'path'

export interface LaunchAppResult {
  error: string | null
  /** The spawned process, for the caller to watch for exit (see
   * gameSession/service.ts) — null whenever error is set. unref()'d and
   * detached, but that only affects whether the handle alone keeps Node's
   * event loop alive, not whether it still emits its own 'exit' event. */
  child: ChildProcess | null
}

/** Detached + unref'd so the launched app isn't tied to (or killed with)
 * Nexus, and cwd set to the executable's own folder — plenty of Windows
 * apps assume that's their working directory to find their own DLLs/assets
 * alongside the exe, and fail oddly if launched with some other cwd. */
export function launchApp(executablePath: string, args: string): Promise<LaunchAppResult> {
  return new Promise((resolve) => {
    try {
      const argList = args.trim() ? args.trim().split(/\s+/) : []
      const child = spawn(executablePath, argList, {
        detached: true,
        stdio: 'ignore',
        cwd: dirname(executablePath)
      })
      let settled = false
      child.once('error', (error) => {
        if (settled) return
        settled = true
        resolve({ error: error.message, child: null })
      })
      // No 'error' within a tick means it started fine — detached processes
      // don't reliably emit 'spawn', so this is the same "probably fine"
      // heuristic used elsewhere in this app for fire-and-forget launches.
      setTimeout(() => {
        if (settled) return
        settled = true
        resolve({ error: null, child })
      }, 250)
      child.unref()
    } catch (error) {
      resolve({ error: error instanceof Error ? error.message : String(error), child: null })
    }
  })
}
