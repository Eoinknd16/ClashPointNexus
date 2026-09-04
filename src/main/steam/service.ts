import type { GameEntry, SteamLibraryResult } from '@shared/steamTypes'
import { loadSteamConfig } from './config'
import { findSteamPath, getInstalledGames, type InstalledApp } from './library'
import { getNonSteamShortcuts } from './shortcuts'
import { fetchOwnedGames } from './webApi'

function shortcutEntries(steamPath: string | null, steamId64: string): GameEntry[] {
  if (!steamPath) return []
  return getNonSteamShortcuts(steamPath, steamId64).map(
    (s): GameEntry => ({
      id: `shortcut:${s.launchGameId}`,
      name: s.name,
      installed: true,
      playtimeForeverMinutes: 0,
      lastPlayed: s.lastPlayed,
      launch: { type: 'shortcut', gameId: s.launchGameId }
    })
  )
}

function installedOnlyEntries(installed: InstalledApp[]): GameEntry[] {
  return installed.map(
    (g): GameEntry => ({
      id: `steam:${g.appId}`,
      name: g.name,
      installed: true,
      playtimeForeverMinutes: 0,
      lastPlayed: g.lastPlayed,
      launch: { type: 'steam', appId: Number(g.appId) },
      imageAppId: Number(g.appId)
    })
  )
}

function byRecency(a: GameEntry, b: GameEntry): number {
  return b.lastPlayed - a.lastPlayed
}

/** Merges local install state, the Steam Web API's owned-games list, and non-Steam shortcuts into one list. */
export async function getSteamLibrary(): Promise<SteamLibraryResult> {
  const config = loadSteamConfig()
  const installed = getInstalledGames()
  const steamPath = findSteamPath()
  const shortcuts = shortcutEntries(steamPath, config.steamId64)

  if (!config.apiKey || !config.steamId64) {
    const games = [...installedOnlyEntries(installed), ...shortcuts].sort(byRecency)
    return { games, needsApiKey: true, error: null }
  }

  const installedByAppId = new Map(installed.map((g) => [Number(g.appId), g]))

  try {
    const owned = await fetchOwnedGames(config.apiKey, config.steamId64)
    const steamGames: GameEntry[] = owned.map((game) => {
      const local = installedByAppId.get(game.appId)
      return {
        id: `steam:${game.appId}`,
        name: game.name,
        installed: Boolean(local),
        playtimeForeverMinutes: game.playtimeForeverMinutes,
        lastPlayed: local?.lastPlayed ?? 0,
        launch: { type: 'steam', appId: game.appId },
        imageAppId: game.appId
      }
    })

    const games = [...steamGames, ...shortcuts].sort(
      (a, b) => b.playtimeForeverMinutes - a.playtimeForeverMinutes || byRecency(a, b)
    )
    return { games, needsApiKey: false, error: null }
  } catch (error) {
    const games = [...installedOnlyEntries(installed), ...shortcuts].sort(byRecency)
    return {
      games,
      needsApiKey: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
