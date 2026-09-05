import { spawn } from 'child_process'
import { dirname } from 'path'

/** Detached + unref'd so the launched app isn't tied to (or killed with)
 * Nexus, and cwd set to the executable's own folder — plenty of Windows
 * apps assume that's their working directory to find their own DLLs/assets
 * alongside the exe, and fail oddly if launched with some other cwd.
 * Resolves to an error string on failure, null on success (spawn can fail
 * either synchronously, e.g. a bad path, or asynchronously via the 'error'
 * event once the process actually tries to start). */
export function launchApp(executablePath: string, args: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const argList = args.trim() ? args.trim().split(/\s+/) : []
      const child = spawn(executablePath, argList, {
        detached: true,
        stdio: 'ignore',
        cwd: dirname(executablePath)
      })
      child.once('error', (error) => resolve(error.message))
      // No 'error' within a tick means it started fine — detached processes
      // don't reliably emit 'spawn', so this is the same "probably fine"
      // heuristic used elsewhere in this app for fire-and-forget launches.
      setTimeout(() => resolve(null), 250)
      child.unref()
    } catch (error) {
      resolve(error instanceof Error ? error.message : String(error))
    }
  })
}
