import { ipcMain } from 'electron'
import type { CatalogType } from '@shared/stremioTypes'
import { fetchSubtitleTracks } from './opensubtitles'

export function registerSubtitlesIpc(): void {
  ipcMain.handle('subtitles:getTracks', (_event, type: CatalogType, id: string) =>
    fetchSubtitleTracks(type, id)
  )
}
