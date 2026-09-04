import { ipcMain } from 'electron'
import type { CatalogType } from '@shared/stremioTypes'
import type { LibraryEntry } from '@shared/libraryTypes'
import { addToLibrary, isInLibrary, listLibrary, removeFromLibrary } from './config'

export function registerLibraryIpc(): void {
  ipcMain.handle('library:list', () => listLibrary())
  ipcMain.handle('library:has', (_event, type: CatalogType, id: string) => isInLibrary(type, id))
  ipcMain.handle('library:add', (_event, entry: Omit<LibraryEntry, 'addedAt'>) => {
    addToLibrary(entry)
  })
  ipcMain.handle('library:remove', (_event, type: CatalogType, id: string) => {
    removeFromLibrary(type, id)
  })
}
