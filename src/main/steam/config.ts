import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface SteamConfig {
  apiKey: string
  steamId64: string
}

const DEFAULT_CONFIG: SteamConfig = { apiKey: '', steamId64: '' }

function configPath(): string {
  const isDev = !app.isPackaged
  return isDev
    ? join(process.cwd(), 'steam.config.json')
    : join(app.getPath('userData'), 'steam.config.json')
}

/** Reads steam.config.json (project root in dev, userData once packaged), seeding a blank file if missing. */
export function loadSteamConfig(): SteamConfig {
  const path = configPath()
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify(DEFAULT_CONFIG, null, 2))
    return DEFAULT_CONFIG
  }

  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(path, 'utf-8')) }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveSteamConfig(config: SteamConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2))
}
