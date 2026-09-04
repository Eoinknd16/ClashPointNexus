import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { registerPlayerIpc } from './player/ipc'
import { startTranscodeProxy, stopTranscodeProxy } from './player/transcodeProxy'
import { registerSettingsIpc } from './settings/ipc'
import { registerSteamIpc } from './steam/ipc'
import { registerStremioIpc } from './stremio/ipc'
import { stopStremioServer } from './stremio/server'
import { registerSubtitlesIpc } from './subtitles/ipc'
import { initAutoUpdater } from './updater'

const isDev = !app.isPackaged

function createWindow(): void {
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
      sandbox: false
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
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerSteamIpc()
  registerStremioIpc()
  registerSettingsIpc()
  registerPlayerIpc()
  registerSubtitlesIpc()
  startTranscodeProxy()
  createWindow()

  if (!isDev) initAutoUpdater()

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
})
