import { ipcMain } from 'electron'
import { probeMediaInfo } from './transcodeProxy'

export function registerPlayerIpc(): void {
  ipcMain.handle('player:probeMediaInfo', (_event, url: string) => probeMediaInfo(url))
}
