import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { CatalogType } from '@shared/stremioTypes'
import type { WatchProgress } from '@shared/progressTypes'

function progressConfigPath(): string {
  const isDev = !app.isPackaged
  return isDev
    ? join(process.cwd(), 'progress.config.json')
    : join(app.getPath('userData'), 'progress.config.json')
}

function storageKey(type: CatalogType, id: string): string {
  return `${type}:${id}`
}

function isWatchProgress(value: unknown): value is WatchProgress {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    (candidate.type === 'movie' || candidate.type === 'series') &&
    typeof candidate.id === 'string' &&
    typeof candidate.positionSeconds === 'number' &&
    typeof candidate.updatedAt === 'number'
  )
}

function loadAll(): Record<string, WatchProgress> {
  const path = progressConfigPath()
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify({}, null, 2))
    return {}
  }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    if (!raw || typeof raw !== 'object') return {}
    const result: Record<string, WatchProgress> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (isWatchProgress(value)) result[key] = value
    }
    return result
  } catch {
    return {}
  }
}

function saveAll(all: Record<string, WatchProgress>): void {
  writeFileSync(progressConfigPath(), JSON.stringify(all, null, 2))
}

export function getProgress(type: CatalogType, id: string): WatchProgress | null {
  return loadAll()[storageKey(type, id)] ?? null
}

export function saveProgress(entry: WatchProgress): void {
  const all = loadAll()
  all[storageKey(entry.type, entry.id)] = entry
  saveAll(all)
}

export function clearProgress(type: CatalogType, id: string): void {
  const all = loadAll()
  delete all[storageKey(type, id)]
  saveAll(all)
}

/** Most-recently-updated first — the basis for a "Continue Watching" row. */
export function getAllProgressForType(type: CatalogType): WatchProgress[] {
  return Object.values(loadAll())
    .filter((p) => p.type === type)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
