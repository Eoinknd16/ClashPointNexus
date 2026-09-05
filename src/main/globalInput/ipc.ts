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

  setMouseModeChangeHandler((active) => {
    mainWindow.webContents.send('globalInput:mouseModeChanged', active)
  })
  setStatusChangeHandler((status) => {
    mainWindow.webContents.send('globalInput:statusChanged', status)
  })
}
