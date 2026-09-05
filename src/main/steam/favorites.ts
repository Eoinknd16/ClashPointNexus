import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

function favoritesConfigPath(): string {
  const isDev = !app.isPackaged
  return isDev
    ? join(process.cwd(), 'game-favorites.config.json')
    : join(app.getPath('userData'), 'game-favorites.config.json')
}

/** Keyed by GameEntry.id ("steam:<appid>" or "shortcut:<id>"), which is stable
 * across re-fetches — the games themselves are never persisted, only which
 * ids are favorited, so a plain string array is enough. */
function loadAll(): string[] {
  const path = favoritesConfigPath()
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify([], null, 2))
    return []
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function saveAll(ids: string[]): void {
  writeFileSync(favoritesConfigPath(), JSON.stringify(ids, null, 2))
}

export function listFavoriteGameIds(): Set<string> {
  return new Set(loadAll())
}

/** Returns the new favorited state after toggling. */
export function toggleFavoriteGame(id: string): boolean {
  const all = loadAll()
  const index = all.indexOf(id)
  if (index === -1) {
    all.push(id)
    saveAll(all)
    return true
  }
  all.splice(index, 1)
  saveAll(all)
  return false
}
