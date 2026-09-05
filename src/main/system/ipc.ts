import { ipcMain } from 'electron'
import { getSystemStats, toggleMute, volumeDown, volumeUp } from './service'

export function registerSystemIpc(): void {
  ipcMain.handle('system:getStats', () => getSystemStats())
  ipcMain.handle('system:volumeUp', () => volumeUp())
  ipcMain.handle('system:volumeDown', () => volumeDown())
  ipcMain.handle('system:toggleMute', () => toggleMute())
}
