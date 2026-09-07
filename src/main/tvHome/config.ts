import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { TvHomeConfig, TvHomePage } from '@shared/tvHomeTypes'
import { randomUUID } from 'crypto'

function tvHomeConfigPath(): string {
  const isDev = !app.isPackaged
  return isDev ? join(process.cwd(), 'tvHome.config.json') : join(app.getPath('userData'), 'tvHome.config.json')
}

function defaultPage(): TvHomePage {
  // Starts genuinely empty (no rows) — the whole point is the user decides
  // what goes here; see TvHomePage.tsx's own empty-state prompt for how a
  // blank page introduces itself the first time.
  return { id: randomUUID(), name: 'My TV', blocks: [] }
}

function defaultConfig(): TvHomeConfig {
  const page = defaultPage()
  return { pages: [page], activePageId: page.id }
}

function isValidConfig(value: unknown): value is TvHomeConfig {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate.pages) && typeof candidate.activePageId === 'string'
}

export function loadTvHomeConfig(): TvHomeConfig {
  const path = tvHomeConfigPath()
  if (!existsSync(path)) {
    const config = defaultConfig()
    writeFileSync(path, JSON.stringify(config, null, 2))
    return config
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    if (!isValidConfig(raw) || raw.pages.length === 0) return defaultConfig()
    // activePageId pointing at a page that's since been deleted (shouldn't
    // normally happen — deletePage always repoints it — but a hand-edited
    // config file could still do this) falls back to the first real page
    // rather than leaving the renderer looking at nothing.
    if (!raw.pages.some((p) => p.id === raw.activePageId)) raw.activePageId = raw.pages[0].id
    return raw
  } catch {
    return defaultConfig()
  }
}

export function saveTvHomeConfig(config: TvHomeConfig): void {
  writeFileSync(tvHomeConfigPath(), JSON.stringify(config, null, 2))
}

export { defaultPage }
