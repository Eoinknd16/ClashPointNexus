import { session, type Session } from 'electron'
import type { PluginPermission } from '@shared/pluginTypes'

const ALWAYS_ALLOWED_SCHEMES = ['file:', 'devtools:']

/**
 * One dedicated, persistent partition per plugin id — isolates each
 * plugin's own storage/cookies/cache from every other plugin AND from the
 * main app's own session (a completely different Electron session, never
 * shared with the main BrowserWindow — see main/index.ts, which never sets
 * a partition at all). Persistent, not in-memory, on purpose: a plugin
 * like Nexus Dash keeps its own high scores in localStorage inside this
 * same sandboxed storage — wiping it every relaunch would defeat the
 * point, and it's already fully isolated per-plugin regardless of whether
 * it persists.
 *
 * Everything is denied by default and only opened up for exactly the
 * permissions this specific plugin's manifest declared (see
 * shared/pluginTypes.ts's own doc comment on why that list exists at
 * all) — must be called, and awaited by the caller, BEFORE a <webview>
 * with this same partition is ever given a src to load (see
 * ipc.ts's prepareLaunch), or a request could slip through during the gap
 * between the webview existing and this handler actually being attached.
 * Camera/mic/geolocation/MIDI/HID/serial/USB/clipboard are never granted
 * to any plugin regardless of what it declares — none of
 * PluginPermission's actual values map to any of those, so there's no
 * legitimate case to carve out yet.
 */
export function setupPluginSession(pluginId: string, permissions: PluginPermission[]): Session {
  const ses = session.fromPartition(`persist:plugin-${pluginId}`)

  const notificationsAllowed = permissions.includes('notifications')
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'notifications' && notificationsAllowed)
  })
  ses.setPermissionCheckHandler((_webContents, permission) => permission === 'notifications' && notificationsAllowed)

  const networkAllowed = permissions.includes('network')
  ses.webRequest.onBeforeRequest((details, callback) => {
    const scheme = details.url.slice(0, details.url.indexOf(':') + 1)
    if (ALWAYS_ALLOWED_SCHEMES.includes(scheme)) {
      callback({ cancel: false })
      return
    }
    callback({ cancel: !networkAllowed })
  })

  return ses
}
