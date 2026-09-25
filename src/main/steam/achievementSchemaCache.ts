import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AchievementSchemaEntry } from './webApi'

function schemaCachePath(): string {
  const isDev = !app.isPackaged
  return isDev
    ? join(process.cwd(), 'steam-achievement-schema-cache.json')
    : join(app.getPath('userData'), 'steam-achievement-schema-cache.json')
}

/** Keyed by appId — names/descriptions/icon URLs are the game's own static
 * definition, not player-specific, so (same reasoning as storeCache.ts) this
 * is cached indefinitely rather than re-fetched every time the achievements
 * list is opened. Per-player achieved/unlockTime state is never cached here
 * — that's fetched fresh every time in service.ts, since unlike the schema
 * it actually changes as the user plays. */
function loadAll(): Record<string, AchievementSchemaEntry[]> {
  const path = schemaCachePath()
  if (!existsSync(path)) return {}
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    return raw && typeof raw === 'object' ? (raw as Record<string, AchievementSchemaEntry[]>) : {}
  } catch {
    return {}
  }
}

function saveAll(cache: Record<string, AchievementSchemaEntry[]>): void {
  writeFileSync(schemaCachePath(), JSON.stringify(cache, null, 2))
}

export function getCachedAchievementSchema(appId: number): AchievementSchemaEntry[] | null {
  return loadAll()[String(appId)] ?? null
}

export function setCachedAchievementSchema(appId: number, entries: AchievementSchemaEntry[]): void {
  const all = loadAll()
  all[String(appId)] = entries
  saveAll(all)
}
