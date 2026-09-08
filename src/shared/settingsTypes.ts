import type { AddonSummary } from './stremioTypes'

export interface SteamSettings {
  apiKey: string
  steamId64: string
}

export interface StremioSettings {
  /** Manually-added addon URLs (Settings > Plugins > TV Addons) — Stremio
   * account login/sync was deliberately removed from core, to come back
   * later as its own plugin instead. */
  addons: AddonSummary[]
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
