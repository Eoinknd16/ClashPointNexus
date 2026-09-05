import { app } from 'electron'
import type { StartupSettings } from '@shared/settingsTypes'

/** Only meaningful for a packaged build — in dev, process.execPath is the
 * bare Electron binary, so registering it as a Windows login item would
 * launch a blank Electron shell instead of this app. The window is already
 * created fullscreen on every launch regardless of how it started
 * (main/index.ts's `fullscreen: !isDev`), so nothing extra is needed here
 * beyond the login-item registration itself for this to actually put the PC
 * into "boots straight into Nexus" territory. */
export function getStartupSettings(): StartupSettings {
  if (!app.isPackaged) return { enabled: false, supported: false }
  return { enabled: app.getLoginItemSettings().openAtLogin, supported: true }
}

export function setStartupEnabled(enabled: boolean): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: enabled })
}
