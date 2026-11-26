import { ipcMain, type BrowserWindow } from 'electron'
import { getWolStatus, runWolSetup } from '../wol/setup'
import {
  getPairingInfo,
  newPairingCode,
  reportScreen,
  respondToPairRequest,
  revokeDevice,
  startRemoteServer
} from './server'

export function registerRemoteIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('remote:getPairingInfo', () => getPairingInfo())
  ipcMain.handle('remote:newPairingCode', () => newPairingCode())
  ipcMain.handle('remote:revokeDevice', (_event, id: string) => revokeDevice(id))
  ipcMain.handle('remote:respondPair', (_event, id: string, approve: boolean) => respondToPairRequest(id, approve))
  ipcMain.handle('wol:getStatus', () => getWolStatus())
  ipcMain.handle('wol:runSetup', () => runWolSetup())
  ipcMain.on('remote:reportScreen', (_event, screen: string) => reportScreen(screen))
  startRemoteServer(mainWindow)
}
