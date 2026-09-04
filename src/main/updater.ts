import { autoUpdater } from 'electron-updater'

/**
 * Checks GitHub Releases (configured via package.json's "build.publish") for a
 * newer version, downloads it in the background, and installs it the next
 * time the app quits — the standard electron-updater flow. Only runs in
 * packaged builds; `npm run dev` has no update feed to check against.
 */
export function initAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (error) => {
    // eslint-disable-next-line no-console
    console.error('[updater] error:', error)
  })
  autoUpdater.on('update-available', (info) => {
    // eslint-disable-next-line no-console
    console.log('[updater] update available:', info.version)
  })
  autoUpdater.on('update-not-available', () => {
    // eslint-disable-next-line no-console
    console.log('[updater] already on the latest version')
  })
  autoUpdater.on('update-downloaded', (info) => {
    // eslint-disable-next-line no-console
    console.log('[updater] update downloaded, installs on next quit:', info.version)
  })

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[updater] check failed:', error)
  })
}
