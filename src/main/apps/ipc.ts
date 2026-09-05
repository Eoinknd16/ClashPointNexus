import { ipcMain } from 'electron'
import { addApp, listApps, removeApp, toggleAppFavorite } from './config'
import { launchApp } from './service'

export function registerAppsIpc(): void {
  ipcMain.handle('apps:list', () => listApps())
  ipcMain.handle('apps:add', (_event, name: string, executablePath: string, args: string) =>
    addApp(name, executablePath, args)
  )
  ipcMain.handle('apps:remove', (_event, id: string) => removeApp(id))
  ipcMain.handle('apps:toggleFavorite', (_event, id: string) => toggleAppFavorite(id))
  ipcMain.handle('apps:launch', (_event, executablePath: string, args: string) => launchApp(executablePath, args))
}
