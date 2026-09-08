import { app, powerMonitor, type BrowserWindow } from 'electron'
import { isControlCenterVisible } from '../controlCenter/window'
import { isGameSessionActive } from '../gameSession/service'
import { isHiddenForDesktop } from './ipc'
import { getGlobalInputStatus } from './service'

const CHECK_INTERVAL_MS = 1500
// How long the system has to have seen literally no input (mouse or
// keyboard, anywhere) before this will reclaim focus -- see the real
// incident this guards against in the doc comment below.
const IDLE_GRACE_SECONDS = 3

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
 * real desktop with a virtual cursor), Control Center (still Nexus, just a
 * second window), or — see IDLE_GRACE_SECONDS — actively using whatever
 * else currently has focus right now.
 *
 * That last one is the fix for a real incident: this used to reclaim focus
 * unconditionally, on the theory that a plain manual alt-tab should get
 * pulled back same as anything else ("stay top level unless I say
 * otherwise" with no exception for casually switching away) — but yanking
 * focus mid-keystroke doesn't just switch windows, it can hand Nexus
 * whatever key or click was actually meant for the other app. A stray
 * Space landing on the player is a real HTML5 <video> default (play/pause),
 * with no code of this app's own involved at all — confirmed as the actual
 * cause of a real "video silently paused itself while I was doing something
 * else on the PC" report. powerMonitor.getSystemIdleTime() is system-wide,
 * not per-window, but that's actually sufficient here: if it reads near
 * zero while Nexus itself doesn't have focus, that input can only have gone
 * to whatever else does. The original problem (an update/login popup
 * stealing focus with the user not touching anything) still recovers fine
 * under this — nothing providing input means idle time climbs past the
 * grace period within a couple of ticks either way.
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
    if (powerMonitor.getSystemIdleTime() < IDLE_GRACE_SECONDS) return

    mainWindow.restore()
    mainWindow.setFullScreen(true)
    mainWindow.show()
    mainWindow.focus()
  }, CHECK_INTERVAL_MS)

  return () => clearInterval(interval)
}
