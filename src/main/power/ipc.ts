import { ipcMain } from 'electron'
import { quitApp, restart, shutdown, sleep } from './service'

export function registerPowerIpc(): void {
  ipcMain.handle('power:sleep', () => sleep())
  ipcMain.handle('power:restart', () => restart())
  ipcMain.handle('power:shutdown', () => shutdown())
  ipcMain.handle('power:quitApp', () => quitApp())
}
