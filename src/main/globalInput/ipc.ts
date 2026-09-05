import { ipcMain, type BrowserWindow } from 'electron'
import { isMouseModeActive, setMouseModeChangeHandler, toggleMouseModeFromApp } from './service'

export function registerGlobalInputIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('globalInput:getMouseModeStatus', () => isMouseModeActive())
  ipcMain.handle('globalInput:toggleMouseMode', () => toggleMouseModeFromApp())

  setMouseModeChangeHandler((active) => {
    mainWindow.webContents.send('globalInput:mouseModeChanged', active)
  })
}
