import { app, ipcMain, type BrowserWindow } from 'electron'
import {
  getGlobalInputStatus,
  setMouseModeChangeHandler,
  setStatusChangeHandler,
  toggleMouseModeFromApp
} from './service'

// Tracks which direction the toggle should go next, rather than inferring it
// from mainWindow.isMinimized() alone -- Electron's minimize/fullscreen
// interaction is exactly the kind of thing worth pinning down explicitly:
// this is also the flag that remembers whether to re-enter fullscreen on the
// way back, so a dev-mode (windowed) run doesn't get forced fullscreen it
// never had.
let hiddenForDesktop = false

/** Physical L1+R1+X combo (from outside the app entirely) and the Quick
 * Menu's "Show Desktop" option both call this -- sends Nexus to the
 * background so the desktop/taskbar/other windows are visible and clickable
 * again, without quitting it. Mouse Mode's cursor control is already global
 * (SetCursorPos/mouse_event don't care which window has focus), so this is
 * the only piece that was actually missing for full controller control of
 * Windows itself. Calling it again restores and refocuses Nexus. */
export function goToDesktop(mainWindow: BrowserWindow): void {
  if (mainWindow.isDestroyed()) return
  const isDev = !app.isPackaged
  if (hiddenForDesktop) {
    mainWindow.restore()
    if (!isDev) mainWindow.setFullScreen(true)
    mainWindow.focus()
    hiddenForDesktop = false
  } else {
    if (!isDev) mainWindow.setFullScreen(false)
    mainWindow.minimize()
    hiddenForDesktop = true
  }
}

export function registerGlobalInputIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('globalInput:getMouseModeStatus', () => getGlobalInputStatus().mouseModeActive)
  ipcMain.handle('globalInput:getStatus', () => getGlobalInputStatus())
  ipcMain.handle('globalInput:toggleMouseMode', () => toggleMouseModeFromApp())
  ipcMain.handle('globalInput:goToDesktop', () => goToDesktop(mainWindow))

  // The helper process's exit handler (in service.ts) can fire notifyStatus
  // slightly after this window is destroyed during app quit -- calling
  // .send() on a destroyed webContents throws "Object has been destroyed"
  // as an uncaught main-process exception (confirmed by a real crash report,
  // shown as Electron's default error dialog), not something try/catch
  // around the send call would even help with avoiding the check itself.
  setMouseModeChangeHandler((active) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('globalInput:mouseModeChanged', active)
  })
  setStatusChangeHandler((status) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('globalInput:statusChanged', status)
  })
}
