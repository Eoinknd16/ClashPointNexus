import { ipcMain, shell, type BrowserWindow } from 'electron'
import type { SteamSettings, SteamSignInResult, StartupSettings, StremioSettings } from '@shared/settingsTypes'
import type { AddonSummary, CommunityAddon } from '@shared/stremioTypes'
import type {
  CommunityThemeSummary,
  ThemeDefinition,
  ThemeInstallResult,
  ThemeScanResult,
  ThemeSubmissionResult
} from '@shared/themeTypes'
import { installCommunityTheme, listCommunityThemes } from './communityThemes'
import { getOmdbApiKey, setOmdbApiKey } from '../ratings/config'
import { loadSteamConfig, saveSteamConfig } from '../steam/config'
import { signInWithSteam } from '../steam/openid'
import { listCommunityAddons } from '../stremio/addonCollection'
import { fetchAddonManifestInfo } from '../stremio/addonManifest'
import { loadStremioConfig, saveStremioConfig } from '../stremio/config'
import { getStartupSettings, setStartupEnabled } from './startup'
import { createCustomTheme, installThemeFromFolder, removeInstalledTheme, scanThemesDropFolder } from './themeInstall'
import { loadCustomThemes, saveCustomThemes, themesDropRoot } from './themes'
import { prepareThemeSubmission } from './themeSubmission'
import { getUiScale, setUiScale } from './uiScale'

export function registerSettingsIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('settings:getUiScale', () => getUiScale())

  ipcMain.handle('settings:setUiScale', (_event, scale: number) => {
    setUiScale(scale)
    // Live — same as picking a theme, no restart needed. mainWindow.
    // webContents rather than event.sender since this is a single-window
    // app anyway and it reads more directly than a same-window assumption.
    if (!mainWindow.isDestroyed()) mainWindow.webContents.setZoomFactor(scale)
  })

  ipcMain.handle('settings:getSteam', (): SteamSettings => {
    const config = loadSteamConfig()
    return { apiKey: config.apiKey, steamId64: config.steamId64 }
  })

  ipcMain.handle('settings:setSteam', (_event, settings: SteamSettings) => {
    saveSteamConfig(settings)
  })

  ipcMain.handle('settings:steamSignIn', async (): Promise<SteamSignInResult> => {
    const { steamId64, error } = await signInWithSteam()
    if (steamId64) {
      saveSteamConfig({ ...loadSteamConfig(), steamId64 })
      return { success: true, error: null, steamId64 }
    }
    return { success: false, error, steamId64: null }
  })

  ipcMain.handle('settings:getStremio', (): StremioSettings => {
    return { addons: loadStremioConfig().addons }
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

  // Powers the TV screen's searchable Addon Store — see
  // stremio/addonCollection.ts for what this actually returns and where
  // from. Installing a listed addon reuses settings:addStremioAddon above
  // (transportUrl is already the normalized base-URL form it expects), so
  // there's no separate "install" handler.
  ipcMain.handle('settings:listCommunityAddons', (): Promise<CommunityAddon[]> => listCommunityAddons())

  ipcMain.handle('settings:getCustomThemes', (): ThemeDefinition[] => loadCustomThemes())

  // The Theme Editor's "Create New Theme" — makes one from nothing (seeded
  // from whatever vars the renderer sends, normally the currently-active
  // theme's own), rather than only ever editing an installed pack.
  ipcMain.handle(
    'settings:createCustomTheme',
    (_event, name: string, seedVars: Record<string, string>): ThemeDefinition =>
      createCustomTheme(name, seedVars)
  )

  ipcMain.handle('settings:installTheme', (_event, folderPath: string): Promise<ThemeInstallResult> =>
    installThemeFromFolder(folderPath)
  )

  ipcMain.handle('settings:scanThemesFolder', (): Promise<ThemeScanResult> => scanThemesDropFolder())

  ipcMain.handle('settings:getThemesFolderPath', (): string => themesDropRoot())

  ipcMain.handle('settings:openThemesFolder', async (): Promise<void> => {
    await shell.openPath(themesDropRoot())
  })

  // Only ever reachable for custom/installed themes — built-ins aren't in
  // themes.config.json at all, so there's nothing here to remove for them
  // (Settings' UI never offers this action on a built-in in the first place).
  ipcMain.handle('settings:removeTheme', (_event, id: string): void => {
    removeInstalledTheme(id)
  })

  ipcMain.handle('settings:listCommunityThemes', (): Promise<CommunityThemeSummary[]> => listCommunityThemes())

  ipcMain.handle(
    'settings:installCommunityTheme',
    (_event, folder: string): Promise<ThemeInstallResult> => installCommunityTheme(folder)
  )

  ipcMain.handle('settings:prepareThemeSubmission', (_event, id: string): ThemeSubmissionResult => {
    const result = prepareThemeSubmission(id)
    if (result.success && result.exportPath) void shell.openPath(result.exportPath)
    return result
  })

  ipcMain.handle('settings:getOmdbApiKey', (): string => getOmdbApiKey())

  ipcMain.handle('settings:setOmdbApiKey', (_event, key: string): void => {
    setOmdbApiKey(key)
  })

  // The in-app color picker (Settings > a custom theme > "Fine-Tune Colors")
  // — only ever touches custom/installed themes, never the built-ins (which
  // aren't tracked in themes.config.json at all), so a not-found id here
  // just means "nothing to persist", not an error worth surfacing.
  ipcMain.handle('settings:updateThemeVars', (_event, id: string, vars: Record<string, string>) => {
    const existing = loadCustomThemes()
    const index = existing.findIndex((t) => t.id === id)
    if (index === -1) return
    existing[index] = { ...existing[index], vars }
    saveCustomThemes(existing)
  })

  ipcMain.handle('settings:getStartup', (): StartupSettings => getStartupSettings())

  ipcMain.handle('settings:setStartupEnabled', (_event, enabled: boolean) => setStartupEnabled(enabled))
}
