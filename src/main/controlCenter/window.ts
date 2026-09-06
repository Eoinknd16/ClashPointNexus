import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

const WIDTH = 420

let win: BrowserWindow | null = null

/**
 * A genuinely separate always-on-top window, unlike QuickMenu (which is
 * rendered inside the main Nexus window and only ever shows after that
 * window is brought to focus, replacing whatever was in front of it) — this
 * one docks to the right edge of the screen and can appear over the desktop,
 * over Nexus itself, or over a game running in windowed/borderless-fullscreen
 * mode, without switching away from what's underneath. It cannot appear over
 * a game running in true exclusive fullscreen — nothing the desktop
 * compositor draws can, without hooking into the game's own graphics API,
 * which this deliberately does not do (see the reasoning this was scoped
 * against: real ban risk from anti-cheat systems treating an unrecognized
 * graphics hook as exactly what they're watching for).
 */
function createWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea

  const controlCenterWindow = new BrowserWindow({
    width: WIDTH,
    height,
    x: x + width - WIDTH,
    y,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  // 'screen-saver' is Electron's highest always-on-top level — the closest
  // this can get to Windows' own most-in-front layer without a graphics
  // hook (see the doc comment above for what that would and wouldn't buy).
  controlCenterWindow.setAlwaysOnTop(true, 'screen-saver')
  controlCenterWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  const query = 'view=controlcenter'
  if (process.env['ELECTRON_RENDERER_URL']) {
    controlCenterWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${query}`)
  } else {
    controlCenterWindow.loadFile(join(__dirname, '../renderer/index.html'), { search: query })
  }

  controlCenterWindow.on('closed', () => {
    if (win === controlCenterWindow) win = null
  })

  return controlCenterWindow
}

export function showControlCenter(): void {
  if (!win || win.isDestroyed()) win = createWindow()
  win.show()
  win.focus()
}

export function hideControlCenter(): void {
  win?.hide()
}

export function toggleControlCenter(): void {
  if (win && !win.isDestroyed() && win.isVisible()) hideControlCenter()
  else showControlCenter()
}
