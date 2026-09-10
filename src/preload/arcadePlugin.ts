import { contextBridge, ipcRenderer } from 'electron'

/**
 * The preload for the one trusted plugin (see main/plugins/trustedPlugins.ts)
 * — currently only ever attached to Arcade's <webview>, decided solely by
 * the main process at launch time (plugins/ipc.ts's prepareLaunch), never
 * by anything a manifest declares. Unlike preload/plugin.ts (every other
 * plugin: two functions, no capability of its own), this exposes real,
 * still-scoped-where-practical primitives: spawn a process, query the
 * registry, pick a folder, list/read/write files. This is genuinely
 * dangerous surface by design (Arcade's own bundle composes these into
 * per-emulator adapters itself, see the plan for why) — treat any change
 * here as a change to what a downloaded, plugin-repo-hosted JS bundle can
 * do to the user's machine.
 */
const bridge = {
  sendToHost: (data: unknown): void => {
    ipcRenderer.sendToHost('cpx', data)
  },
  onHostMessage: (callback: (data: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data)
    ipcRenderer.on('cpx-to-guest', listener)
    return () => ipcRenderer.removeListener('cpx-to-guest', listener)
  },
  spawnProcess: (path: string, args: string[]): Promise<{ error: string | null }> =>
    ipcRenderer.invoke('arcade:spawnProcess', path, args),
  /** Returns the raw `reg query` stdout, or null if the key doesn't exist —
   * parsing it (same regex-extraction shape as main/stremio/paths.ts) is
   * left to Arcade's own bundle so a new emulator's detection logic never
   * needs a core Nexus change. */
  queryRegistry: (hive: 'HKCU' | 'HKLM', keyPath: string): Promise<string | null> =>
    ipcRenderer.invoke('arcade:queryRegistry', hive, keyPath),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('arcade:pickFolder'),
  listDir: (path: string): Promise<string[]> => ipcRenderer.invoke('arcade:listDir', path),
  readFile: (path: string): Promise<string> => ipcRenderer.invoke('arcade:readFile', path),
  writeFile: (path: string, content: string): Promise<void> => ipcRenderer.invoke('arcade:writeFile', path, content),
  /** Read-only, one named variable at a time — e.g. LOCALAPPDATA, to build
   * install-location guesses a fixed candidate-path list can't cover
   * (an installer's actual default varies by version/install method). */
  getEnvVar: (name: string): Promise<string | null> => ipcRenderer.invoke('arcade:getEnvVar', name)
}

contextBridge.exposeInMainWorld('__cpxTrusted', bridge)
