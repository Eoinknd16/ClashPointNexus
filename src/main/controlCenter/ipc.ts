import { app, type BrowserWindow, ipcMain } from 'electron'
import { clearHiddenForDesktop } from '../globalInput/ipc'
import { hideControlCenter } from './window'

/** Shared by the PS button's click handler (index.ts) and the overlay's own
 * "Return to Nexus" button — both need the exact same sequence. restore()
 * before show()/focus() matters whenever this fires while a game session
 * (gameSession/service.ts) has minimized Nexus — plain show() doesn't
 * reliably un-minimize a window on Windows, the same reason goToDesktop's
 * own restore path already calls it.
 *
 * setFullScreen(true) + clearHiddenForDesktop() matter just as much: this
 * is also exactly how the user gets back to Nexus after Show Desktop
 * (goToDesktop's own hidden branch), and without them this used to restore
 * a genuinely *windowed* Nexus (taskbar visible, real fullscreen never
 * re-entered) while still internally believing hiddenForDesktop was true —
 * a real, confirmed report of the whole app staying visibly laggy from
 * that point on, not just a cosmetic "forgot to fullscreen" glitch. */
export function returnToNexus(mainWindow: BrowserWindow): void {
  hideControlCenter()
  if (mainWindow.isDestroyed()) return
  mainWindow.restore()
  if (app.isPackaged) mainWindow.setFullScreen(true)
  mainWindow.show()
  mainWindow.focus()
  clearHiddenForDesktop()
  mainWindow.webContents.send('globalInput:goHome')
}

export function registerControlCenterIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('controlCenter:returnToNexus', () => returnToNexus(mainWindow))
  ipcMain.handle('controlCenter:close', () => hideControlCenter())
}
