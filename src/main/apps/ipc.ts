import { ipcMain, type BrowserWindow } from 'electron'
import { runGameSession, waitForChildExit } from '../gameSession/service'
import { addApp, listApps, removeApp, toggleAppFavorite } from './config'
import { launchApp } from './service'

export function registerAppsIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('apps:list', () => listApps())
  ipcMain.handle('apps:add', (_event, name: string, executablePath: string, args: string) =>
    addApp(name, executablePath, args)
  )
  ipcMain.handle('apps:remove', (_event, id: string) => removeApp(id))
  ipcMain.handle('apps:toggleFavorite', (_event, id: string) => toggleAppFavorite(id))

  ipcMain.handle('apps:launch', async (_event, executablePath: string, args: string): Promise<string | null> => {
    const { error, child } = await launchApp(executablePath, args)
    // Nexus steps out of the way for the whole session, not just the launch
    // itself — same "hide, wait, come back" shape as a Steam game (see
    // steam/ipc.ts). Not awaited: the renderer only needs to know the
    // launch itself started OK, not sit blocked for the entire session.
    if (!error && child) void runGameSession(mainWindow, waitForChildExit(child))
    return error
  })
}
