import { ipcMain } from 'electron'
import { restart, shutdown, sleep } from './service'

export function registerPowerIpc(): void {
  ipcMain.handle('power:sleep', () => sleep())
  ipcMain.handle('power:restart', () => restart())
  ipcMain.handle('power:shutdown', () => shutdown())
}
