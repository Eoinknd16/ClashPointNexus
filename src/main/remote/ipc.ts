import { ipcMain, type BrowserWindow } from 'electron'
import { getPairingInfo, newPairingCode, reportScreen, revokeDevice, startRemoteServer } from './server'

export function registerRemoteIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('remote:getPairingInfo', () => getPairingInfo())
  ipcMain.handle('remote:newPairingCode', () => newPairingCode())
  ipcMain.handle('remote:revokeDevice', (_event, id: string) => revokeDevice(id))
  ipcMain.on('remote:reportScreen', (_event, screen: string) => reportScreen(screen))
  startRemoteServer(mainWindow)
}
