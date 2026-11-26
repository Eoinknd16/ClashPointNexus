import type { AchievementDetail, AchievementProgress, GameEntry, GameStoreInfo, SteamLibraryResult } from '@shared/steamTypes'
import { getCachedAchievementSchema, setCachedAchievementSchema } from './achievementSchemaCache'
import { loadSteamConfig } from './config'
import { listFavoriteGameIds } from './favorites'
import { findSteamPath, getInstalledGames, type InstalledApp } from './library'
import { getNonSteamShortcuts } from './shortcuts'
import { fetchAppDetails } from './storeApi'
import { getCachedStoreInfo, setCachedStoreInfo } from './storeCache'
import {
  fetchAchievementSchema,
  fetchOwnedGames,
  fetchPlayerAchievements,
  fetchPlayerAchievementStates,
  mergeAchievementDetails
} from './webApi'

async function shortcutEntries(steamPath: string | null, steamId64: string): Promise<GameEntry[]> {
  if (!steamPath) return []
  return (await getNonSteamShortcuts(steamPath, steamId64)).map(
    (s): GameEntry => ({
      id: `shortcut:${s.launchGameId}`,
      name: s.name,
      installed: true,
      playtimeForeverMinutes: 0,
      lastPlayed: s.lastPlayed,
      launch: { type: 'shortcut', gameId: s.launchGameId },
      imageDataUrl: s.imageDataUrl,
      favorite: false
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
      imageAppId: Number(g.appId),
      favorite: false,
      updatePending: g.updatePending,
      downloadProgressPercent: g.downloadProgressPercent
    })
  )
}

/** Merges in the persisted favorite flag — applied once, right before
 * returning, rather than threading it through every entry-building function
 * above (three separate construction paths: shortcuts, installed-only, and
 * the full owned-games list). */
function applyFavorites(games: GameEntry[]): GameEntry[] {
  const favoriteIds = listFavoriteGameIds()
  return games.map((g) => (favoriteIds.has(g.id) ? { ...g, favorite: true } : g))
}

function byRecency(a: GameEntry, b: GameEntry): number {
  return b.lastPlayed - a.lastPlayed
}

// Short-lived cache + in-flight dedupe for the library build below. Home
// alone asks for it twice on mount (its own stats + getContinueSuggestion),
// and the Games screen asks again the moment you open it -- each one used to
// redo every disk read and the Steam Web API call from scratch. Favorites
// are deliberately NOT part of what's cached (applied fresh per call), so a
// toggle shows up immediately; anything else (an install finishing) shows
// up within LIBRARY_CACHE_MS.
const LIBRARY_CACHE_MS = 15_000
let libraryInFlight: Promise<SteamLibraryResult> | null = null
let libraryCache: { at: number; result: SteamLibraryResult } | null = null

/** Merges local install state, the Steam Web API's owned-games list, and non-Steam shortcuts into one list. */
export async function getSteamLibrary(): Promise<SteamLibraryResult> {
  if (libraryCache && Date.now() - libraryCache.at < LIBRARY_CACHE_MS) {
    return withFavorites(libraryCache.result)
  }
  if (!libraryInFlight) {
    libraryInFlight = buildSteamLibrary()
      .then((result) => {
        // Don't hold on to a transient failure for the whole cache window.
        if (!result.error) libraryCache = { at: Date.now(), result }
        return result
      })
      .finally(() => {
        libraryInFlight = null
      })
  }
  return withFavorites(await libraryInFlight)
}

function withFavorites(result: SteamLibraryResult): SteamLibraryResult {
  return { ...result, games: applyFavorites(result.games) }
}

/** Just the count, for Home's stats card -- saves shipping the entire
 * library (including every non-Steam shortcut's base64 artwork) across IPC
 * into the renderer only for it to call `.length` on it. */
export async function getSteamGameCount(): Promise<number> {
  return (await getSteamLibrary()).games.length
}

async function buildSteamLibrary(): Promise<SteamLibraryResult> {
  const config = loadSteamConfig()
  const [installed, steamPath] = await Promise.all([getInstalledGames(), findSteamPath()])
  const shortcuts = await shortcutEntries(steamPath, config.steamId64)

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
        imageAppId: game.appId,
        favorite: false,
        updatePending: local?.updatePending,
        downloadProgressPercent: local?.downloadProgressPercent
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

export async function getAchievements(appId: number): Promise<AchievementProgress | null> {
  const config = loadSteamConfig()
  if (!config.apiKey || !config.steamId64) return null
  return fetchPlayerAchievements(config.apiKey, config.steamId64, appId)
}

/** The full per-achievement list (name/description/icons/unlocked state) for
 * the detail panel's "view all achievements" drill-in — separate from
 * getAchievements above (which stays a lightweight count for the summary bar
 * every selection already fetches) since this needs a second Web API call
 * the common case of never opening the list shouldn't pay for. Schema
 * (name/description/icons) is cached indefinitely on disk; player state
 * (achieved/unlockTime) is always fetched fresh, since that's the part that
 * actually changes as the user plays. Null only when no achievements schema
 * exists for this game at all or no API key is configured — not for "stats
 * are private", which still returns the schema with everything locked. */
export async function getAchievementDetails(appId: number): Promise<AchievementDetail[] | null> {
  const config = loadSteamConfig()
  if (!config.apiKey) return null

  let schema = getCachedAchievementSchema(appId)
  if (!schema) {
    schema = await fetchAchievementSchema(config.apiKey, appId)
    if (schema.length > 0) setCachedAchievementSchema(appId, schema)
  }
  if (schema.length === 0) return null

  const states = config.steamId64
    ? await fetchPlayerAchievementStates(config.apiKey, config.steamId64, appId)
    : null
  return mergeAchievementDetails(schema, states)
}

// Chained through one shared promise rather than a real queue data structure
// — the only thing that matters is spacing out actual network calls so the
// Games screen's background prefetch (every owned game, potentially 100+ of
// them, all requested at once) can't burst-hit the storefront API. Cache
// hits below bypass this entirely, so it only ever throttles genuinely new
// appIds, never a screen revisit.
let fetchQueue: Promise<unknown> = Promise.resolve()
const FETCH_SPACING_MS = 350

/** No API key gate here — the storefront API needs none. Checks the on-disk
 * cache first (populated across every session, not just this one) before
 * ever making a network call. */
export async function getStoreInfo(appId: number): Promise<GameStoreInfo | null> {
  const cached = getCachedStoreInfo(appId)
  if (cached) return cached

  const queued = fetchQueue.then(async () => {
    const info = await fetchAppDetails(appId)
    await new Promise((resolve) => setTimeout(resolve, FETCH_SPACING_MS))
    return info
  })
  fetchQueue = queued.catch(() => undefined)

  const info = await queued
  if (info) setCachedStoreInfo(appId, info)
  return info
}
