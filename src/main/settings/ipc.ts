import { ipcMain } from 'electron'
import type {
  SteamSettings,
  StremioImportResult,
  StremioLoginResult,
  StremioSettings
} from '@shared/settingsTypes'
import type { AddonSummary } from '@shared/stremioTypes'
import type { ThemeDefinition } from '@shared/themeTypes'
import { loadSteamConfig, saveSteamConfig } from '../steam/config'
import { fetchAccountAddons, fetchAddonManifestInfo, stremioLogin } from '../stremio/account'
import { loadStremioConfig, saveStremioConfig } from '../stremio/config'
import { importStremioHistory } from '../stremio/importHistory'
import { loadCustomThemes } from './themes'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:getSteam', (): SteamSettings => {
    const config = loadSteamConfig()
    return { apiKey: config.apiKey, steamId64: config.steamId64 }
  })

  ipcMain.handle('settings:setSteam', (_event, settings: SteamSettings) => {
    saveSteamConfig(settings)
  })

  ipcMain.handle('settings:getStremio', (): StremioSettings => {
    const config = loadStremioConfig()
    return {
      addons: config.addons,
      authKey: config.authKey ?? null,
      email: config.email ?? null
    }
  })

  ipcMain.handle('settings:setStremioAddons', (_event, addons: AddonSummary[]) => {
    const config = loadStremioConfig()
    saveStremioConfig({ ...config, addons })
  })

  ipcMain.handle('settings:addStremioAddon', async (_event, url: string): Promise<AddonSummary[]> => {
    const config = loadStremioConfig()
    let info: { name: string; resources: string[]; catalogs: NonNullable<AddonSummary['catalogs']> }
    try {
      info = await fetchAddonManifestInfo(url)
    } catch {
      info = { name: new URL(url).host, resources: ['stream'], catalogs: [] }
    }
    const addons = [
      ...config.addons,
      { name: info.name, url, resources: info.resources, catalogs: info.catalogs }
    ]
    saveStremioConfig({ ...config, addons })
    return addons
  })

  ipcMain.handle('settings:getCustomThemes', (): ThemeDefinition[] => loadCustomThemes())

  ipcMain.handle(
    'settings:stremioLogin',
    async (_event, email: string, password: string): Promise<StremioLoginResult> => {
      try {
        const authKey = await stremioLogin(email, password)
        const addons = await fetchAccountAddons(authKey)
        const config = loadStremioConfig()
        saveStremioConfig({ ...config, authKey, email, addons })
        return { success: true, error: null, addonsSynced: addons.length }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          addonsSynced: 0
        }
      }
    }
  )

  ipcMain.handle('settings:resyncStremioAddons', async (): Promise<StremioLoginResult> => {
    const config = loadStremioConfig()
    if (!config.authKey) {
      return { success: false, error: 'Not logged in', addonsSynced: 0 }
    }
    try {
      const addons = await fetchAccountAddons(config.authKey)
      saveStremioConfig({ ...config, addons })
      return { success: true, error: null, addonsSynced: addons.length }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        addonsSynced: 0
      }
    }
  })

  ipcMain.handle('settings:importStremioHistory', (): Promise<StremioImportResult> => importStremioHistory())
}
