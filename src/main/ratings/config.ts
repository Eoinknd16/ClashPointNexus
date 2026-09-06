import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

function ratingsConfigPath(): string {
  const isDev = !app.isPackaged
  return isDev ? join(process.cwd(), 'ratings.config.json') : join(app.getPath('userData'), 'ratings.config.json')
}

interface RatingsConfig {
  omdbApiKey: string
}

function load(): RatingsConfig {
  const path = ratingsConfigPath()
  if (!existsSync(path)) return { omdbApiKey: '' }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return { omdbApiKey: typeof raw?.omdbApiKey === 'string' ? raw.omdbApiKey : '' }
  } catch {
    return { omdbApiKey: '' }
  }
}

export function getOmdbApiKey(): string {
  return load().omdbApiKey
}

export function setOmdbApiKey(key: string): void {
  writeFileSync(ratingsConfigPath(), JSON.stringify({ omdbApiKey: key.trim() }, null, 2))
}
