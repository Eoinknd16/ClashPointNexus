export type GameLaunchTarget =
  | { type: 'steam'; appId: number }
  | { type: 'shortcut'; gameId: string }

export interface GameEntry {
  id: string
  name: string
  installed: boolean
  playtimeForeverMinutes: number
  lastPlayed: number
  launch: GameLaunchTarget
  /** Steam appid to fetch box art for — absent for non-Steam shortcuts. */
  imageAppId?: number
  /** Local custom-artwork data URI for non-Steam shortcuts — absent if none was set. */
  imageDataUrl?: string
  favorite: boolean
  /** Absent for non-Steam shortcuts, which have no Steam update mechanism at all. */
  updatePending?: boolean
  downloadProgressPercent?: number | null
}

export interface SteamLibraryResult {
  games: GameEntry[]
  needsApiKey: boolean
  error: string | null
}

export interface AchievementProgress {
  unlocked: number
  total: number
}

/** From Steam's public storefront API — descriptive only, no bearing on
 * anything the user's own library/playtime data depends on. */
export interface GameStoreInfo {
  description: string | null
  genres: string[]
  releaseDate: string | null
  metacriticScore: number | null
  developers: string[]
  publishers: string[]
}
