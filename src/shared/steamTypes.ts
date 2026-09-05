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
}

export interface SteamLibraryResult {
  games: GameEntry[]
  needsApiKey: boolean
  error: string | null
}
