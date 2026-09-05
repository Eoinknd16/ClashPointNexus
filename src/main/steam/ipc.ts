import { ipcMain, shell } from 'electron'
import type { GameLaunchTarget } from '@shared/steamTypes'
import { toggleFavoriteGame } from './favorites'
import { getAchievements, getSteamLibrary } from './service'

export function registerSteamIpc(): void {
  ipcMain.handle('steam:getLibrary', () => getSteamLibrary())

  ipcMain.handle('steam:toggleFavorite', (_event, id: string) => toggleFavoriteGame(id))

  ipcMain.handle('steam:getAchievements', (_event, appId: number) => getAchievements(appId))

  ipcMain.handle('steam:launch', (_event, target: GameLaunchTarget) => {
    const url =
      target.type === 'steam' ? `steam://run/${target.appId}` : `steam://rungameid/${target.gameId}`
    return shell.openExternal(url)
  })

  ipcMain.handle('steam:install', (_event, appId: number) =>
    shell.openExternal(`steam://install/${appId}`)
  )
}
