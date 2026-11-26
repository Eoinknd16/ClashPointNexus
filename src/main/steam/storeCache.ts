import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { GameStoreInfo } from '@shared/steamTypes'

function storeCachePath(): string {
  const isDev = !app.isPackaged
  return isDev
    ? join(process.cwd(), 'steam-store-cache.json')
    : join(app.getPath('userData'), 'steam-store-cache.json')
}

/** Keyed by appId — genres/controller support/etc. essentially never change
 * for a given app, so this is cached indefinitely rather than re-fetched
 * every session. Needed for the Games screen's Controller Friendly filter,
 * which has to know every owned game's store info up front, not just
 * whichever one is currently selected — without this, filtering the whole
 * library would mean re-hitting the storefront API for every game on every
 * single screen visit. */
//
// Held in memory after the first read. This used to re-read and re-parse the
// *entire* cache file on every single lookup, and rewrite the entire file
// (pretty-printed) on every new entry -- and the Games screen's background
// prefetch does one lookup per owned game, so opening Games meant hundreds of
// synchronous full-file reads/writes on Electron's main process, which is
// the thread that also delivers input and frames to the window.
let memory: Record<string, GameStoreInfo> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
const SAVE_DEBOUNCE_MS = 2000

function loadAll(): Record<string, GameStoreInfo> {
  if (memory) return memory
  const path = storeCachePath()
  memory = {}
  if (!existsSync(path)) return memory
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    if (raw && typeof raw === 'object') memory = raw as Record<string, GameStoreInfo>
  } catch {
    // corrupt cache -- start fresh, it refills itself
  }
  return memory
}

/** Coalesces a burst of new entries (the prefetch) into one async write. */
function scheduleSave(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    if (!memory) return
    writeFile(storeCachePath(), JSON.stringify(memory)).catch(() => {
      // best-effort -- worst case a few entries get re-fetched next session
    })
  }, SAVE_DEBOUNCE_MS)
}

export function getCachedStoreInfo(appId: number): GameStoreInfo | null {
  return loadAll()[String(appId)] ?? null
}

export function setCachedStoreInfo(appId: number, info: GameStoreInfo): void {
  loadAll()[String(appId)] = info
  scheduleSave()
}

/** Whatever's already cached, keyed by appId as a real number — lets the
 * renderer seed its filters instantly with zero network calls, before the
 * background prefetch (see service.ts's getStoreInfo) fills in the rest. */
export function getAllCachedStoreInfo(): Record<number, GameStoreInfo> {
  const all = loadAll()
  const result: Record<number, GameStoreInfo> = {}
  for (const [key, value] of Object.entries(all)) result[Number(key)] = value
  return result
}
