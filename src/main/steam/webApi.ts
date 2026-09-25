import type { AchievementDetail, AchievementProgress } from '@shared/steamTypes'

export interface OwnedGame {
  appId: number
  name: string
  playtimeForeverMinutes: number
}

interface GetOwnedGamesResponse {
  response?: {
    games?: Array<{
      appid: number
      name: string
      playtime_forever: number
    }>
  }
}

/** Full owned-games list (installed or not) via Steam's Web API — requires a personal API key. */
export async function fetchOwnedGames(apiKey: string, steamId64: string): Promise<OwnedGame[]> {
  const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('steamid', steamId64)
  url.searchParams.set('include_appinfo', 'true')
  url.searchParams.set('include_played_free_games', 'true')
  url.searchParams.set('format', 'json')

  const response = await fetch(url)
  if (response.status === 401) {
    throw new Error('Steam Web API key rejected (401). Check the key and SteamID64 in Settings')
  }
  if (response.status === 403) {
    throw new Error('Steam Web API forbidden (403). The profile/game details may be set to private')
  }
  if (!response.ok) {
    throw new Error(`Steam Web API responded with ${response.status}`)
  }

  const data = (await response.json()) as GetOwnedGamesResponse
  const games = data.response?.games ?? []

  return games.map((game) => ({
    appId: game.appid,
    name: game.name,
    playtimeForeverMinutes: game.playtime_forever
  }))
}

interface GetPlayerAchievementsResponse {
  playerstats?: {
    success?: boolean
    achievements?: Array<{ achieved: number }>
  }
}

/** Null covers every "not applicable" case the same way (no achievements
 * schema for this game, stats set to private, a delisted/unknown appid) —
 * none of those are actual errors worth surfacing, just reasons to hide the
 * achievements line in the detail panel entirely. GetPlayerAchievements
 * itself returns every achievement (locked and unlocked), so its length is
 * already the total — no separate schema call needed just for a count. */
export async function fetchPlayerAchievements(
  apiKey: string,
  steamId64: string,
  appId: number
): Promise<AchievementProgress | null> {
  const url = new URL('https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('steamid', steamId64)
  url.searchParams.set('appid', String(appId))
  url.searchParams.set('format', 'json')

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return null
    const data = (await response.json()) as GetPlayerAchievementsResponse
    const achievements = data.playerstats?.achievements
    if (!data.playerstats?.success || !achievements || achievements.length === 0) return null
    return {
      unlocked: achievements.filter((a) => a.achieved === 1).length,
      total: achievements.length
    }
  } catch {
    return null
  }
}

export interface AchievementSchemaEntry {
  apiName: string
  displayName: string
  description: string
  iconUrl: string
  iconGrayUrl: string
}

interface GetSchemaForGameResponse {
  game?: {
    availableGameStats?: {
      achievements?: Array<{
        name: string
        displayName?: string
        description?: string
        icon?: string
        icongray?: string
      }>
    }
  }
}

/** The static, per-game definition of every achievement (name, description,
 * icons) — keyed only by the app's own Web API key, nothing player-specific,
 * so unlike GetPlayerAchievements this never depends on profile/game-details
 * privacy and is safe to cache indefinitely (see achievementSchemaCache.ts).
 * Empty array (not null) for a game with no achievements at all — a real,
 * common case, distinct from "the request itself failed". */
export async function fetchAchievementSchema(apiKey: string, appId: number): Promise<AchievementSchemaEntry[]> {
  const url = new URL('https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('appid', String(appId))
  url.searchParams.set('l', 'english')

  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) return []
  const data = (await response.json()) as GetSchemaForGameResponse
  const achievements = data.game?.availableGameStats?.achievements ?? []
  return achievements.map((a) => ({
    apiName: a.name,
    displayName: a.displayName ?? a.name,
    description: a.description ?? '',
    iconUrl: a.icon ?? '',
    iconGrayUrl: a.icongray ?? ''
  }))
}

interface GetPlayerAchievementsDetailResponse {
  playerstats?: {
    success?: boolean
    achievements?: Array<{ apiname: string; achieved: number; unlocktime?: number }>
  }
}

/** Just the per-player achieved/unlockTime half — merged with the schema
 * above (by apiName) in service.ts to build the full displayable list. Same
 * null-covers-every-non-error-case reasoning as fetchPlayerAchievements. */
export async function fetchPlayerAchievementStates(
  apiKey: string,
  steamId64: string,
  appId: number
): Promise<Map<string, { achieved: boolean; unlockTimeSeconds: number | null }> | null> {
  const url = new URL('https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('steamid', steamId64)
  url.searchParams.set('appid', String(appId))
  url.searchParams.set('format', 'json')

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return null
    const data = (await response.json()) as GetPlayerAchievementsDetailResponse
    const achievements = data.playerstats?.achievements
    if (!data.playerstats?.success || !achievements) return null
    return new Map(
      achievements.map((a) => [
        a.apiname,
        { achieved: a.achieved === 1, unlockTimeSeconds: a.achieved === 1 ? a.unlocktime ?? null : null }
      ])
    )
  } catch {
    return null
  }
}

/** Merges the static schema with per-player state into the full displayable
 * list — schema entries with no matching player state (stats private, or
 * the call failed) still show up as locked/unachieved rather than vanishing,
 * since "we don't know" and "definitely locked" look the same to a viewer
 * either way. Sorted unlocked-first (most recently unlocked first), then
 * locked in the schema's own declared order, matching Steam's own page. */
export function mergeAchievementDetails(
  schema: AchievementSchemaEntry[],
  states: Map<string, { achieved: boolean; unlockTimeSeconds: number | null }> | null
): AchievementDetail[] {
  const merged = schema.map((entry): AchievementDetail => {
    const state = states?.get(entry.apiName)
    return {
      apiName: entry.apiName,
      displayName: entry.displayName,
      description: entry.description,
      iconUrl: entry.iconUrl,
      iconGrayUrl: entry.iconGrayUrl,
      achieved: state?.achieved ?? false,
      unlockTimeSeconds: state?.unlockTimeSeconds ?? null
    }
  })
  return merged.sort((a, b) => {
    if (a.achieved !== b.achieved) return a.achieved ? -1 : 1
    if (a.achieved && b.achieved) return (b.unlockTimeSeconds ?? 0) - (a.unlockTimeSeconds ?? 0)
    return 0
  })
}
