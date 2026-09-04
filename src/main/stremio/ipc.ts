import { ipcMain } from 'electron'
import type { CatalogType } from '@shared/stremioTypes'
import { getCatalog, getReleaseDate, getStreamOptions } from './service'

export function registerStremioIpc(): void {
  ipcMain.handle('stremio:getCatalog', (_event, type: CatalogType, catalogId: string) =>
    getCatalog(type, catalogId)
  )
  ipcMain.handle('stremio:getStreams', (_event, type: CatalogType, id: string) => getStreamOptions(type, id))
  ipcMain.handle('stremio:getReleaseDate', (_event, type: CatalogType, id: string) =>
    getReleaseDate(type, id)
  )
}
