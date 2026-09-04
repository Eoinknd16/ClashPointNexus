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
    throw new Error('Steam Web API key rejected (401) — check the key and SteamID64 in Settings')
  }
  if (response.status === 403) {
    throw new Error('Steam Web API forbidden (403) — the profile/game details may be set to private')
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
