import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppEntry } from '@shared/appsTypes'

function appsConfigPath(): string {
  const isDev = !app.isPackaged
  return isDev ? join(process.cwd(), 'apps.config.json') : join(app.getPath('userData'), 'apps.config.json')
}

function isAppEntry(value: unknown): value is AppEntry {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.executablePath === 'string' &&
    typeof candidate.args === 'string' &&
    typeof candidate.favorite === 'boolean' &&
    typeof candidate.addedAt === 'number'
  )
}

function loadAll(): AppEntry[] {
  const path = appsConfigPath()
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify([], null, 2))
    return []
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return Array.isArray(raw) ? raw.filter(isAppEntry) : []
  } catch {
    return []
  }
}

function saveAll(apps: AppEntry[]): void {
  writeFileSync(appsConfigPath(), JSON.stringify(apps, null, 2))
}

/** Most-recently-added first. */
export function listApps(): AppEntry[] {
  return loadAll().sort((a, b) => b.addedAt - a.addedAt)
}

export function addApp(name: string, executablePath: string, args: string): AppEntry {
  const entry: AppEntry = {
    id: `app:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    name,
    executablePath,
    args,
    favorite: false,
    addedAt: Date.now()
  }
  const all = loadAll()
  all.push(entry)
  saveAll(all)
  return entry
}

export function removeApp(id: string): void {
  saveAll(loadAll().filter((a) => a.id !== id))
}

/** Returns the new favorited state. */
export function toggleAppFavorite(id: string): boolean {
  const all = loadAll()
  const entry = all.find((a) => a.id === id)
  if (!entry) return false
  entry.favorite = !entry.favorite
  saveAll(all)
  return entry.favorite
}
