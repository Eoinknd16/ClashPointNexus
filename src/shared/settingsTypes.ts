import type { AddonSummary } from './stremioTypes'

export interface SteamSettings {
  apiKey: string
  steamId64: string
}

export interface StremioSettings {
  addons: AddonSummary[]
  authKey: string | null
  email: string | null
}

export interface StremioLoginResult {
  success: boolean
  error: string | null
  addonsSynced: number
}
