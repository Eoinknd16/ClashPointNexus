import { ipcMain, shell, type BrowserWindow } from 'electron'
import type { GameLaunchTarget } from '@shared/steamTypes'
import { runGameSession, waitForSteamAppExit } from '../gameSession/service'
import { toggleFavoriteGame } from './favorites'
import { getAchievements, getSteamLibrary, getStoreInfo } from './service'

export function registerSteamIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('steam:getLibrary', () => getSteamLibrary())

  ipcMain.handle('steam:toggleFavorite', (_event, id: string) => toggleFavoriteGame(id))

  ipcMain.handle('steam:getAchievements', (_event, appId: number) => getAchievements(appId))

  ipcMain.handle('steam:getStoreInfo', (_event, appId: number) => getStoreInfo(appId))

  ipcMain.handle('steam:launch', async (_event, target: GameLaunchTarget) => {
    const id = target.type === 'steam' ? String(target.appId) : target.gameId
    const url = target.type === 'steam' ? `steam://run/${target.appId}` : `steam://rungameid/${target.gameId}`
    const result = await shell.openExternal(url)
    // Not awaited: Steam's own "Running" flag (what this actually polls)
    // won't flip until well after this handler would otherwise have
    // returned, and the renderer only needs to know the launch request
    // itself was sent, not sit blocked for the whole play session.
    void runGameSession(mainWindow, waitForSteamAppExit(id))
    return result
  })

  ipcMain.handle('steam:install', (_event, appId: number) =>
    shell.openExternal(`steam://install/${appId}`)
  )
}
