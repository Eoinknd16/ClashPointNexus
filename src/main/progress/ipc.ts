import { ipcMain } from 'electron'
import type { CatalogType } from '@shared/stremioTypes'
import type { WatchProgress } from '@shared/progressTypes'
import { clearProgress, getProgress, saveProgress } from './config'

export function registerProgressIpc(): void {
  ipcMain.handle('progress:get', (_event, type: CatalogType, id: string) => getProgress(type, id))
  ipcMain.handle('progress:save', (_event, entry: WatchProgress) => {
    saveProgress(entry)
  })
  ipcMain.handle('progress:clear', (_event, type: CatalogType, id: string) => {
    clearProgress(type, id)
  })
}
