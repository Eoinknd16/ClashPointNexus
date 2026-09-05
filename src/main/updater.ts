import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/updateTypes'

const isDev = !app.isPackaged

let status: UpdateStatus = { state: 'idle', version: null, error: null, progressPercent: null }

function setStatus(next: UpdateStatus): void {
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('updater:status', status)
  }
}

/** Always registered, even in dev — `check`/`quitAndInstall` just report
 * "unsupported" there instead of the renderer getting a missing-channel error. */
export function registerUpdaterIpc(): void {
  ipcMain.handle('updater:getStatus', () => status)
  ipcMain.handle('updater:getVersion', () => app.getVersion())

  ipcMain.handle('updater:check', async () => {
    if (isDev) {
      setStatus({ state: 'unsupported', version: null, error: null, progressPercent: null })
      return
    }
    setStatus({ state: 'checking', version: null, error: null, progressPercent: null })
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      setStatus({
        state: 'error',
        version: null,
        error: error instanceof Error ? error.message : String(error),
        progressPercent: null
      })
    }
  })

  ipcMain.handle('updater:quitAndInstall', () => {
    // Silent + force-relaunch: without these args, NSIS opens its full
    // assisted-install wizard (Next/Install/Finish), which needs a mouse.
    // `isSilentInstall=true` runs the installer with the standard NSIS `/S`
    // flag instead — no UI at all — and `isForceRunAfter=true` relaunches
    // the app automatically once it's done, so the whole thing is hands-off.
    if (status.state === 'downloaded') autoUpdater.quitAndInstall(true, true)
  })
}

/**
 * Checks GitHub Releases (configured via package.json's "build.publish") for a
 * newer version, downloads it in the background, and installs it the next
 * time the app quits — or immediately if the user picks "Restart to Install"
 * in Settings once it's downloaded. Only wired up in packaged builds;
 * `npm run dev` has no update feed to check against.
 */
export function initAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    setStatus({ state: 'checking', version: null, error: null, progressPercent: null })
  })
  autoUpdater.on('update-available', (info) => {
    setStatus({ state: 'downloading', version: info.version, error: null, progressPercent: 0 })
  })
  autoUpdater.on('update-not-available', () => {
    setStatus({ state: 'not-available', version: null, error: null, progressPercent: null })
  })
  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      state: 'downloading',
      version: status.version,
      error: null,
      progressPercent: Math.round(progress.percent)
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({ state: 'downloaded', version: info.version, error: null, progressPercent: 100 })
  })
  autoUpdater.on('error', (error) => {
    setStatus({ state: 'error', version: null, error: error.message, progressPercent: null })
  })

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    setStatus({
      state: 'error',
      version: null,
      error: error instanceof Error ? error.message : String(error),
      progressPercent: null
    })
  })
}
