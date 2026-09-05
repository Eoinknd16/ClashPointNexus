import { execFile } from 'child_process'
import { app } from 'electron'

/** Windows-only, matching the rest of this app (NSIS installer, Steam registry
 * lookups, etc.) — shutdown/restart are built-in commands; sleep has no direct
 * CLI equivalent, so it uses the well-known powrprof.dll rundll32 trick. */
export function sleep(): void {
  execFile('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'])
}

export function restart(): void {
  execFile('shutdown', ['/r', '/t', '0'])
}

export function shutdown(): void {
  execFile('shutdown', ['/s', '/t', '0'])
}

/** Closes ClashPoint Nexus itself — falling back to the desktop, not the OS. */
export function quitApp(): void {
  app.quit()
}
