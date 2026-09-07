import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

function streamingConfigPath(): string {
  const isDev = !app.isPackaged
  return isDev ? join(process.cwd(), 'streaming.config.json') : join(app.getPath('userData'), 'streaming.config.json')
}

interface StreamingConfig {
  tmdbApiKey: string
}

function load(): StreamingConfig {
  const path = streamingConfigPath()
  if (!existsSync(path)) return { tmdbApiKey: '' }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return { tmdbApiKey: typeof raw?.tmdbApiKey === 'string' ? raw.tmdbApiKey : '' }
  } catch {
    return { tmdbApiKey: '' }
  }
}

export function getTmdbApiKey(): string {
  return load().tmdbApiKey
}

export function setTmdbApiKey(key: string): void {
  writeFileSync(streamingConfigPath(), JSON.stringify({ tmdbApiKey: key.trim() }, null, 2))
}
