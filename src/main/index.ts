import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { registerAppsIpc } from './apps/ipc'
import { registerFilesystemIpc } from './filesystem/ipc'
import { registerGlobalInputIpc } from './globalInput/ipc'
import { setQuickMenuComboHandler, startGlobalInputWatcher, stopGlobalInputWatcher } from './globalInput/service'
import { registerHomeIpc } from './home/ipc'
import { registerLibraryIpc } from './library/ipc'
import { registerPlayerIpc } from './player/ipc'
import { startTranscodeProxy, stopTranscodeProxy } from './player/transcodeProxy'
import { registerPowerIpc } from './power/ipc'
import { registerProgressIpc } from './progress/ipc'
import { registerSettingsIpc } from './settings/ipc'
import { registerSteamIpc } from './steam/ipc'
import { registerStremioIpc } from './stremio/ipc'
import { stopStremioServer } from './stremio/server'
import { registerSubtitlesIpc } from './subtitles/ipc'
import { registerSystemIpc } from './system/ipc'
import { initAutoUpdater, registerUpdaterIpc } from './updater'
import { registerWeatherIpc } from './weather/ipc'

const isDev = !app.isPackaged

function createWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  const mainWindow = new BrowserWindow({
    width: isDev ? 1280 : width,
    height: isDev ? 800 : height,
    fullscreen: !isDev,
    autoHideMenuBar: true,
    frame: isDev,
    backgroundColor: '#0b0b0f',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Only for the Browse screen's <webview> — the guest page it loads runs
      // in its own separate, isolated renderer process with no Node/Electron
      // access, same as any ordinary browser tab.
      webviewTag: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })
  })

  // Dev-only escape hatch: kiosk builds have no frame/menu, so Escape
  // is the only way out while iterating locally.
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (isDev && input.key === 'Escape' && input.type === 'keyDown') {
      mainWindow.close()
    }
    // F12 opens DevTools in packaged builds too — otherwise a crash report
    // that isn't caught by anything the renderer itself surfaces (the
    // CrashToast, an error boundary) has no way to actually get looked at,
    // since a packaged build has no console visible by default.
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools()
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  registerSteamIpc()
  registerStremioIpc()
  registerSettingsIpc()
  registerPlayerIpc()
  registerSubtitlesIpc()
  registerProgressIpc()
  registerLibraryIpc()
  registerUpdaterIpc()
  registerFilesystemIpc()
  registerPowerIpc()
  registerWeatherIpc()
  registerHomeIpc()
  registerSystemIpc()
  registerAppsIpc()
  startTranscodeProxy()
  const mainWindow = createWindow()
  registerGlobalInputIpc(mainWindow)

  if (!isDev) initAutoUpdater()

  // Gated to packaged builds only — the whole point is reaching Nexus from
  // outside the app (another game, the desktop), which isn't a meaningful
  // scenario to exercise from a dev-mode window, and losing mouse control to
  // a hair-trigger bug while iterating on this exact code would be a bad time.
  if (!isDev) {
    setQuickMenuComboHandler(() => {
      if (mainWindow.isDestroyed()) return
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('globalInput:openQuickMenu')
    })
    startGlobalInputWatcher()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  stopStremioServer()
  stopTranscodeProxy()
  stopGlobalInputWatcher()
})
