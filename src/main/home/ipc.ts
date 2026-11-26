import { ipcMain } from 'electron'
import type { HomeLibraryStats } from '@shared/homeTypes'
import { listLibrary } from '../library/config'
import { getSteamGameCount } from '../steam/service'
import { getContinueSuggestion } from './service'

export function registerHomeIpc(): void {
  ipcMain.handle('home:getContinueSuggestion', () => getContinueSuggestion())

  // Plain listLibrary(), not the library:list handler -- that one also
  // backfills missing posters over the network, which Home's counts don't
  // need and which used to run on every Home mount.
  ipcMain.handle('home:getLibraryStats', async (): Promise<HomeLibraryStats> => {
    const library = listLibrary()
    return {
      movies: library.filter((e) => e.type === 'movie').length,
      series: library.filter((e) => e.type === 'series').length,
      games: await getSteamGameCount()
    }
  })
}
