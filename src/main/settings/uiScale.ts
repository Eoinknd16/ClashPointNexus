import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { DEFAULT_UI_SCALE, UI_SCALE_PRESETS } from '@shared/uiScale'

// This isn't a theme property (it doesn't change with the active theme, and
// it has to be readable before any renderer/theme code has run at all — see
// main/index.ts, which applies it via webContents.setZoomFactor at window
// creation), so it gets its own tiny standalone config file instead of
// folding into themes.config.json.
function configPath(): string {
  const isDev = !app.isPackaged
  return isDev ? join(process.cwd(), 'uiScale.config.json') : join(app.getPath('userData'), 'uiScale.config.json')
}

export function getUiScale(): number {
  try {
    const path = configPath()
    if (!existsSync(path)) return DEFAULT_UI_SCALE
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    const scale = Number(raw?.scale)
    return UI_SCALE_PRESETS.includes(scale as (typeof UI_SCALE_PRESETS)[number]) ? scale : DEFAULT_UI_SCALE
  } catch {
    return DEFAULT_UI_SCALE
  }
}

export function setUiScale(scale: number): void {
  writeFileSync(configPath(), JSON.stringify({ scale }, null, 2))
}
