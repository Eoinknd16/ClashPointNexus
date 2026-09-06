import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ThemeDefinition } from '@shared/themeTypes'

export function themesConfigPath(): string {
  const isDev = !app.isPackaged
  return isDev
    ? join(process.cwd(), 'themes.config.json')
    : join(app.getPath('userData'), 'themes.config.json')
}

/** Root folder installed theme packs' copied image assets live under —
 * .../theme-assets/<themeId>/<filename>, one subfolder per installed theme. */
export function themeAssetsRoot(): string {
  const isDev = !app.isPackaged
  return isDev ? join(process.cwd(), 'theme-assets') : join(app.getPath('userData'), 'theme-assets')
}

const DEFAULT_CUSTOM_THEMES: ThemeDefinition[] = []

function isThemeDefinition(value: unknown): value is ThemeDefinition {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.vars === 'object' &&
    candidate.vars !== null
  )
}

/** Reads themes.config.json (project root in dev, userData once packaged) — hand-editable custom themes. */
export function loadCustomThemes(): ThemeDefinition[] {
  const path = themesConfigPath()
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify(DEFAULT_CUSTOM_THEMES, null, 2))
    return DEFAULT_CUSTOM_THEMES
  }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return Array.isArray(raw) ? raw.filter(isThemeDefinition) : DEFAULT_CUSTOM_THEMES
  } catch {
    return DEFAULT_CUSTOM_THEMES
  }
}

export function saveCustomThemes(themes: ThemeDefinition[]): void {
  writeFileSync(themesConfigPath(), JSON.stringify(themes, null, 2))
}
