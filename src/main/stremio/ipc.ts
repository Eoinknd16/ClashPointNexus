import { ipcMain } from 'electron'
import type { CatalogType, ExtendedMeta } from '@shared/stremioTypes'
import {
  getAddonCatalogs,
  getCatalog,
  getContinueWatching,
  getExtendedMeta,
  getReleaseDate,
  getSeriesMeta,
  getStreamOptions,
  searchCatalog
} from './service'

export function registerStremioIpc(): void {
  ipcMain.handle(
    'stremio:getCatalog',
    (_event, type: CatalogType, catalogId: string, skip?: number, genre?: string) =>
      getCatalog(type, catalogId, skip, genre)
  )
  ipcMain.handle('stremio:getStreams', (_event, type: CatalogType, id: string) => getStreamOptions(type, id))
  ipcMain.handle('stremio:getReleaseDate', (_event, type: CatalogType, id: string) =>
    getReleaseDate(type, id)
  )
  ipcMain.handle(
    'stremio:getExtendedMeta',
    (_event, type: CatalogType, id: string): Promise<ExtendedMeta> => getExtendedMeta(type, id)
  )
  ipcMain.handle('stremio:getSeriesMeta', (_event, id: string) => getSeriesMeta(id))
  ipcMain.handle('stremio:getContinueWatching', (_event, type: CatalogType) => getContinueWatching(type))
  ipcMain.handle('stremio:getAddonCatalogs', (_event, type: CatalogType) => getAddonCatalogs(type))
  ipcMain.handle('stremio:search', (_event, type: CatalogType, query: string) => searchCatalog(type, query))
}
