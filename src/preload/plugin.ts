import { contextBridge, ipcRenderer } from 'electron'

/**
 * The <webview> a plugin actually runs inside (see renderer/src/plugins/
 * PluginHost.tsx) gets THIS preload, never the main window's own
 * src/preload/index.ts — that one exposes window.api, the full set of
 * everything this app can do (launch apps, touch the filesystem, read the
 * Steam library...), and a plugin bundle is untrusted third-party code (see
 * shared/pluginTypes.ts's own doc comment on why permissions are declared
 * up front). Handing it that bridge would make every declared permission
 * meaningless — it could just do all of it regardless of what its
 * manifest.json claims.
 *
 * This exposes exactly two functions, both plain message relays with no
 * capability of their own — sendToHost forwards a message out to the host
 * page (PluginHost.tsx), onHostMessage delivers whatever the host sends
 * back in. Nothing here reaches ipcMain directly, touches the filesystem,
 * or exposes any Node global. The actual API surface a plugin's code sees
 * (api.onNav/api.exit, defined in the per-plugin shell HTML written by
 * main/plugins/pluginShell.ts) is built entirely on top of these two calls
 * inside the sandboxed guest page itself — this file is only the pipe.
 */
const bridge = {
  sendToHost: (data: unknown): void => {
    ipcRenderer.sendToHost('cpx', data)
  },
  onHostMessage: (callback: (data: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data)
    ipcRenderer.on('cpx-to-guest', listener)
    return () => ipcRenderer.removeListener('cpx-to-guest', listener)
  }
}

contextBridge.exposeInMainWorld('__cpx', bridge)
