import type { AddonSummary } from './stremioTypes'

export interface SteamSettings {
  apiKey: string
  steamId64: string
}

export interface StremioSettings {
  addons: AddonSummary[]
  authKey: string | null
  email: string | null
  /** When the addon collection was last pulled from the account — null if
   * never synced. Auto-refreshed periodically (see stremio/service.ts), not
   * just on a manual "Re-sync" press, so this is mostly informational. */
  lastAddonsSyncedAt: number | null
}

export interface StremioLoginResult {
  success: boolean
  error: string | null
  addonsSynced: number
}

export interface StremioImportResult {
  success: boolean
  error: string | null
  progressImported: number
  libraryImported: number
}

export interface SteamSignInResult {
  success: boolean
  error: string | null
  steamId64: string | null
}

export interface StartupSettings {
  enabled: boolean
  /** False in a dev build — process.execPath there is the bare Electron
   * binary, not this app, so registering it as a login item would launch
   * the wrong thing entirely. */
  supported: boolean
}
