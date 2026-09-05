import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { HighScoreEntry, ScoreSubmitResult } from '@shared/arcadeTypes'

const MAX_ENTRIES = 10

function scoresPath(): string {
  const isDev = !app.isPackaged
  return isDev
    ? join(process.cwd(), 'arcade-scores.json')
    : join(app.getPath('userData'), 'arcade-scores.json')
}

function isHighScoreEntry(value: unknown): value is HighScoreEntry {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.score === 'number' &&
    typeof candidate.achievedAt === 'number'
  )
}

function loadAll(): HighScoreEntry[] {
  const path = scoresPath()
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify([], null, 2))
    return []
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return Array.isArray(raw) ? raw.filter(isHighScoreEntry) : []
  } catch {
    return []
  }
}

function saveAll(entries: HighScoreEntry[]): void {
  writeFileSync(scoresPath(), JSON.stringify(entries, null, 2))
}

export function getHighScores(): HighScoreEntry[] {
  return loadAll()
}

/** rank is computed against the full sorted list before trimming to
 * MAX_ENTRIES, so a score that just misses the cut still gets an honest
 * "you were #11" instead of a false null. Reference equality against the
 * just-created entry object (not a separate id field) is enough to find it
 * again post-sort, since nothing else in this function mutates or clones it. */
export function submitScore(name: string, score: number): ScoreSubmitResult {
  const entry: HighScoreEntry = { name: name.trim().slice(0, 16) || 'Player', score, achievedAt: Date.now() }
  const all = loadAll()
  all.push(entry)
  all.sort((a, b) => b.score - a.score)
  const rank = all.indexOf(entry)
  const trimmed = all.slice(0, MAX_ENTRIES)
  saveAll(trimmed)
  return { entries: trimmed, rank: rank < MAX_ENTRIES ? rank : null }
}
