import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'fs'
import { join } from 'path'

const MAX_LOG_BYTES = 5 * 1024 * 1024

export function logsDir(): string {
  return join(app.getPath('userData'), 'logs')
}

function logFilePath(): string {
  return join(logsDir(), 'nexus.log')
}

/**
 * The only diagnostic trail a beta user has — nothing else in this app
 * persists what went wrong anywhere. Every "why did this break" fix this
 * project has ever shipped came from someone describing exactly what they
 * saw in the moment, live; a beta user reporting a bug won't have that
 * same channel, so whatever ends up here has to be the whole story:
 * uncaught main-process errors (see index.ts's process.on handlers),
 * everything the renderer's own global error/rejection handlers and
 * ErrorBoundary already catch (main.tsx, ErrorBoundary.tsx — those
 * previously only console.error'd, invisible in a packaged build with no
 * DevTools open), and one line per app start so a sent log shows which
 * version was running and when.
 */
export function appendLog(level: 'info' | 'error', message: string): void {
  try {
    const dir = logsDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const path = logFilePath()
    // Simple size-capped rotation, checked lazily on write rather than on
    // a timer — crashes are rare, so this is never a hot path. One backup
    // generation is plenty for a beta's worth of bug reports; nothing here
    // needs to keep a deep history.
    if (existsSync(path) && statSync(path).size > MAX_LOG_BYTES) {
      renameSync(path, join(dir, 'nexus.log.old'))
    }

    const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${message}\n`
    appendFileSync(path, line, 'utf-8')
  } catch {
    // The log file itself is diagnostic-only — if writing it fails (e.g. a
    // full disk), that's not a reason to compound the original problem.
  }
}

export function logSessionStart(): void {
  appendLog('info', `ClashPoint Nexus v${app.getVersion()} starting (${app.isPackaged ? 'packaged' : 'dev'})`)
}
