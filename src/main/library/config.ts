import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { CatalogType } from '@shared/stremioTypes'
import type { LibraryEntry } from '@shared/libraryTypes'

function libraryConfigPath(): string {
  const isDev = !app.isPackaged
  return isDev
    ? join(process.cwd(), 'library.config.json')
    : join(app.getPath('userData'), 'library.config.json')
}

function storageKey(type: CatalogType, id: string): string {
  return `${type}:${id}`
}

function isLibraryEntry(value: unknown): value is LibraryEntry {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    (candidate.type === 'movie' || candidate.type === 'series') &&
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.addedAt === 'number'
  )
}

function loadAll(): Record<string, LibraryEntry> {
  const path = libraryConfigPath()
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify({}, null, 2))
    return {}
  }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    if (!raw || typeof raw !== 'object') return {}
    const result: Record<string, LibraryEntry> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (isLibraryEntry(value)) result[key] = value
    }
    return result
  } catch {
    return {}
  }
}

function saveAll(all: Record<string, LibraryEntry>): void {
  writeFileSync(libraryConfigPath(), JSON.stringify(all, null, 2))
}

/** Most-recently-added first. */
export function listLibrary(): LibraryEntry[] {
  return Object.values(loadAll()).sort((a, b) => b.addedAt - a.addedAt)
}

export function isInLibrary(type: CatalogType, id: string): boolean {
  return storageKey(type, id) in loadAll()
}

export function addToLibrary(entry: Omit<LibraryEntry, 'addedAt'>): void {
  const all = loadAll()
  all[storageKey(entry.type, entry.id)] = { ...entry, addedAt: Date.now() }
  saveAll(all)
}

export function removeFromLibrary(type: CatalogType, id: string): void {
  const all = loadAll()
  delete all[storageKey(type, id)]
  saveAll(all)
}

/** Persists a backfilled poster so the lookup only ever happens once per entry. */
export function updateLibraryPoster(type: CatalogType, id: string, poster: string): void {
  const all = loadAll()
  const key = storageKey(type, id)
  const entry = all[key]
  if (!entry) return
  all[key] = { ...entry, poster }
  saveAll(all)
}
