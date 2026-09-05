import { ipcMain } from 'electron'
import { getSystemStats } from './service'

export function registerSystemIpc(): void {
  ipcMain.handle('system:getStats', () => getSystemStats())
}
