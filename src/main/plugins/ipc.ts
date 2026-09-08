import { ipcMain } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type {
  CommunityPluginSummary,
  InstalledPlugin,
  PluginInstallResult,
  PluginLaunchResult
} from '@shared/pluginTypes'
import { listCommunityPlugins } from './communityPlugins'
import { loadInstalledPlugins, pluginDir } from './config'
import { installPlugin, uninstallPlugin, verifyInstalledBundle } from './install'
import { setupPluginSession } from './session'
import { isTrustedPlugin } from './trustedPlugins'

export function registerPluginsIpc(): void {
  ipcMain.handle('plugins:listCommunity', (): Promise<CommunityPluginSummary[]> => listCommunityPlugins())

  ipcMain.handle('plugins:listInstalled', (): InstalledPlugin[] => loadInstalledPlugins())

  ipcMain.handle('plugins:install', (_event, folder: string): Promise<PluginInstallResult> => installPlugin(folder))

  ipcMain.handle('plugins:uninstall', (_event, id: string): void => uninstallPlugin(id))

  // Sets up the plugin's locked-down session BEFORE returning anything the
  // renderer could use to actually create the <webview> — see session.ts's
  // own doc comment for why that ordering is the entire point: the session
  // has to already be denying everything before the guest page's first
  // request has any chance of firing, not a moment after.
  ipcMain.handle('plugins:prepareLaunch', (_event, id: string): PluginLaunchResult => {
    const installed = loadInstalledPlugins().find((p) => p.manifest.id === id)
    if (!installed) return { ok: false, error: 'Not installed' }
    if (!verifyInstalledBundle(installed)) {
      return {
        ok: false,
        error: "This plugin's files changed since it was installed, reinstall it before running it again"
      }
    }
    setupPluginSession(id, installed.manifest.permissions)
    const trusted = isTrustedPlugin(id)
    return {
      ok: true,
      info: {
        indexUrl: pathToFileURL(join(pluginDir(id), 'index.html')).toString(),
        // Never anything the manifest can influence — see
        // trustedPlugins.ts's own doc comment for why this hardcoded check
        // is the entire security boundary of the trusted tier.
        preloadPath: join(__dirname, trusted ? '../preload/arcadePlugin.js' : '../preload/plugin.js'),
        partition: `persist:plugin-${id}`,
        trusted
      }
    }
  })
}
