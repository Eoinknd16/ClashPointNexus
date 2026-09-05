import { ipcMain, type BrowserWindow } from 'electron'
import {
  getGlobalInputStatus,
  setMouseModeChangeHandler,
  setStatusChangeHandler,
  toggleMouseModeFromApp
} from './service'

export function registerGlobalInputIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('globalInput:getMouseModeStatus', () => getGlobalInputStatus().mouseModeActive)
  ipcMain.handle('globalInput:getStatus', () => getGlobalInputStatus())
  ipcMain.handle('globalInput:toggleMouseMode', () => toggleMouseModeFromApp())

  // The helper process's exit handler (in service.ts) can fire notifyStatus
  // slightly after this window is destroyed during app quit -- calling
  // .send() on a destroyed webContents throws "Object has been destroyed"
  // as an uncaught main-process exception (confirmed by a real crash report,
  // shown as Electron's default error dialog), not something try/catch
  // around the send call would even help with avoiding the check itself.
  setMouseModeChangeHandler((active) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('globalInput:mouseModeChanged', active)
  })
  setStatusChangeHandler((status) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('globalInput:statusChanged', status)
  })
}
