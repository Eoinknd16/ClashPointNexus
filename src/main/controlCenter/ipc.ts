import { type BrowserWindow, ipcMain } from 'electron'
import { hideControlCenter } from './window'

/** Shared by the PS button's click handler (index.ts) and the overlay's own
 * "Return to Nexus" button — both need the exact same sequence. */
export function returnToNexus(mainWindow: BrowserWindow): void {
  hideControlCenter()
  if (mainWindow.isDestroyed()) return
  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send('globalInput:goHome')
}

export function registerControlCenterIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('controlCenter:returnToNexus', () => returnToNexus(mainWindow))
  ipcMain.handle('controlCenter:close', () => hideControlCenter())
}
