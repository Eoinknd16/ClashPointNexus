import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
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
function loadAll(): Record<string, GameStoreInfo> {
  const path = storeCachePath()
  if (!existsSync(path)) return {}
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    return raw && typeof raw === 'object' ? (raw as Record<string, GameStoreInfo>) : {}
  } catch {
    return {}
  }
}

function saveAll(cache: Record<string, GameStoreInfo>): void {
  writeFileSync(storeCachePath(), JSON.stringify(cache, null, 2))
}

export function getCachedStoreInfo(appId: number): GameStoreInfo | null {
  return loadAll()[String(appId)] ?? null
}

export function setCachedStoreInfo(appId: number, info: GameStoreInfo): void {
  const all = loadAll()
  all[String(appId)] = info
  saveAll(all)
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
