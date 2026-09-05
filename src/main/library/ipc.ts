import { ipcMain } from 'electron'
import type { CatalogType } from '@shared/stremioTypes'
import type { LibraryEntry } from '@shared/libraryTypes'
import { fetchBasicMeta } from '../stremio/cinemeta'
import { addToLibrary, isInLibrary, listLibrary, removeFromLibrary, updateLibraryPoster } from './config'

/** Some entries (esp. ones from the Stremio watch-history import, which only
 * had Stremio's own sparser account-API poster field to go on) were stored
 * with no poster at all — backfilled from Cinemeta's own metadata (which,
 * unlike that account API, reliably has one) and persisted so this only ever
 * runs once per entry, not on every list call. */
async function listLibraryWithBackfill(): Promise<LibraryEntry[]> {
  const entries = listLibrary()
  return Promise.all(
    entries.map(async (entry) => {
      if (entry.poster) return entry
      const meta = await fetchBasicMeta(entry.type, entry.id)
      if (!meta?.poster) return entry
      updateLibraryPoster(entry.type, entry.id, meta.poster)
      return { ...entry, poster: meta.poster }
    })
  )
}

export function registerLibraryIpc(): void {
  ipcMain.handle('library:list', () => listLibraryWithBackfill())
  ipcMain.handle('library:has', (_event, type: CatalogType, id: string) => isInLibrary(type, id))
  ipcMain.handle('library:add', (_event, entry: Omit<LibraryEntry, 'addedAt'>) => {
    addToLibrary(entry)
  })
  ipcMain.handle('library:remove', (_event, type: CatalogType, id: string) => {
    removeFromLibrary(type, id)
  })
}
