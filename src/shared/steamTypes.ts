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

/** One achievement's full display data, merged from two separate Steam Web
 * API calls (see webApi.ts): GetSchemaForGame for the name/description/icons
 * (public, keyed only by the app's own key — same regardless of whose
 * achievements these are), and GetPlayerAchievements for achieved/unlockTime
 * (the actual per-player state). Sorted unlocked-first (most recent unlock
 * first), then locked in the schema's own declared order — the same
 * convention Steam's own achievement page uses. */
export interface AchievementDetail {
  apiName: string
  displayName: string
  description: string
  /** Full-color icon (unlocked state) — always present in the schema. */
  iconUrl: string
  /** Grayed-out icon (locked state) — always present in the schema. */
  iconGrayUrl: string
  achieved: boolean
  /** Seconds since epoch, or null if locked (or achieved but Steam didn't report a time). */
  unlockTimeSeconds: number | null
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
  /** From the storefront's "categories" list (ids 28/18) — 'none' covers
   * both "explicitly no controller support" and "categories didn't say". */
  controllerSupport: 'full' | 'partial' | 'none'
}
