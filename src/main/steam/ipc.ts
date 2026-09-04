import { ipcMain, shell } from 'electron'
import type { GameLaunchTarget } from '@shared/steamTypes'
import { getSteamLibrary } from './service'

export function registerSteamIpc(): void {
  ipcMain.handle('steam:getLibrary', () => getSteamLibrary())

  ipcMain.handle('steam:launch', (_event, target: GameLaunchTarget) => {
    const url =
      target.type === 'steam' ? `steam://run/${target.appId}` : `steam://rungameid/${target.gameId}`
    return shell.openExternal(url)
  })

  ipcMain.handle('steam:install', (_event, appId: number) =>
    shell.openExternal(`steam://install/${appId}`)
  )
}
