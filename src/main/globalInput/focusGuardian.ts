import { app, type BrowserWindow } from 'electron'
import { isControlCenterVisible } from '../controlCenter/window'
import { isGameSessionActive } from '../gameSession/service'
import { isHiddenForDesktop } from './ipc'
import { getGlobalInputStatus } from './service'

const CHECK_INTERVAL_MS = 1500

/**
 * Nexus is meant to behave like a console's own shell, not just another
 * desktop app sharing the screen with whatever else is running — but a
 * typical gaming PC has a pile of things configured to auto-launch
 * alongside it (Steam, Discord, a peripheral's tray app, a launcher's
 * background service, ...), and any one of them popping an update/login
 * browser window on its own steals foreground focus with no way back short
 * of a mouse — the existing PS-button reclaim (returnToNexus) only fires on
 * an explicit press, so it doesn't help if the controller's attention was
 * never on Nexus to begin with.
 *
 * This periodically checks whether the main window still has focus and, if
 * something else has taken it, reclaims it — unless one of the genuinely
 * legitimate "the user meant this" states applies: a launched game/app
 * session, an explicit Show Desktop, Mouse Mode (deliberately driving the
 * real desktop with a virtual cursor), or Control Center (still Nexus,
 * just a second window). Anything else — including a plain manual alt-tab —
 * gets pulled back, which is the actual point: "stay top level unless I say
 * otherwise" doesn't carve out an exception for casually switching away.
 *
 * Packaged builds only — a developer alt-tabbing to a terminal/editor while
 * iterating is the normal workflow, not a bug to fight.
 */
export function startFocusGuardian(mainWindow: BrowserWindow): () => void {
  if (!app.isPackaged) return () => {}

  const interval = setInterval(() => {
    if (mainWindow.isDestroyed()) return
    if (mainWindow.isFocused()) return
    if (isControlCenterVisible()) return
    if (isHiddenForDesktop()) return
    if (isGameSessionActive()) return
    if (getGlobalInputStatus().mouseModeActive) return

    mainWindow.restore()
    mainWindow.setFullScreen(true)
    mainWindow.show()
    mainWindow.focus()
  }, CHECK_INTERVAL_MS)

  return () => clearInterval(interval)
}
