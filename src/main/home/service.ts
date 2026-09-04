import type { ContinueSuggestion } from '@shared/homeTypes'
import { seasonSortKey } from '@shared/stremioTypes'
import { getAllProgressForType } from '../progress/config'
import { getSteamLibrary } from '../steam/service'
import { fetchBasicMeta, fetchSeriesMeta } from '../stremio/cinemeta'

function steamHeaderUrl(appId: number): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`
}

/**
 * Picks the single most recent thing across Steam play sessions and Stremio
 * watch progress (movies and series both) — whichever has the latest
 * timestamp wins the Home screen's "continue" card. For a series specifically,
 * also checks whether a newer episode has aired since the last-watched one,
 * and suggests that instead of a plain resume if so.
 */
export async function getContinueSuggestion(): Promise<ContinueSuggestion | null> {
  try {
    return await buildContinueSuggestion()
  } catch {
    // Best-effort home-screen card — a network hiccup fetching title meta
    // shouldn't be visible to the user, it should just mean no card shows.
    return null
  }
}

async function buildContinueSuggestion(): Promise<ContinueSuggestion | null> {
  const library = await getSteamLibrary()
  const movieProgress = getAllProgressForType('movie')[0]
  const seriesProgress = getAllProgressForType('series')[0]

  const mostRecentGame = [...library.games]
    .filter((g) => g.lastPlayed > 0)
    .sort((a, b) => b.lastPlayed - a.lastPlayed)[0]

  type Candidate = { kind: 'game' | 'movie' | 'series'; updatedAt: number }
  const candidates: Candidate[] = []
  if (mostRecentGame) candidates.push({ kind: 'game', updatedAt: mostRecentGame.lastPlayed * 1000 })
  if (movieProgress) candidates.push({ kind: 'movie', updatedAt: movieProgress.updatedAt })
  if (seriesProgress) candidates.push({ kind: 'series', updatedAt: seriesProgress.updatedAt })
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.updatedAt - a.updatedAt)
  const winner = candidates[0].kind

  if (winner === 'game' && mostRecentGame) {
    return {
      kind: 'game',
      title: mostRecentGame.name,
      subtitle: 'Continue Playing',
      poster:
        mostRecentGame.imageDataUrl ??
        (mostRecentGame.imageAppId ? steamHeaderUrl(mostRecentGame.imageAppId) : null),
      game: mostRecentGame
    }
  }

  if (winner === 'movie' && movieProgress) {
    const meta = await fetchBasicMeta('movie', movieProgress.id)
    if (!meta) return null
    return {
      kind: 'tv',
      title: meta.name,
      subtitle: 'Continue Watching',
      poster: meta.poster,
      tab: 'movie',
      item: {
        id: movieProgress.id,
        type: 'movie',
        name: meta.name,
        poster: meta.poster,
        description: null,
        year: null,
        released: null,
        genres: []
      }
    }
  }

  if (winner === 'series' && seriesProgress) {
    const meta = await fetchBasicMeta('series', seriesProgress.id)
    if (!meta) return null

    let subtitle =
      seriesProgress.season != null && seriesProgress.episode != null
        ? `Continue S${seriesProgress.season}E${seriesProgress.episode}`
        : 'Continue Watching'

    if (seriesProgress.season != null && seriesProgress.episode != null) {
      try {
        const seriesMeta = await fetchSeriesMeta(seriesProgress.id)
        const sorted = [...seriesMeta.episodes].sort(
          (a, b) => seasonSortKey(a.season) - seasonSortKey(b.season) || a.episode - b.episode
        )
        const currentIdx = sorted.findIndex(
          (e) => e.season === seriesProgress.season && e.episode === seriesProgress.episode
        )
        const next = currentIdx >= 0 ? sorted[currentIdx + 1] : undefined
        const nextAired = next?.released ? Date.parse(next.released) <= Date.now() : false
        if (next && nextAired) {
          subtitle = `New Episode: S${next.season}E${next.episode}`
        }
      } catch {
        // fetchSeriesMeta failing just means we fall back to the plain "continue" subtitle
      }
    }

    return {
      kind: 'tv',
      title: meta.name,
      subtitle,
      poster: meta.poster,
      tab: 'series',
      item: {
        id: seriesProgress.id,
        type: 'series',
        name: meta.name,
        poster: meta.poster,
        description: null,
        year: null,
        released: null,
        genres: []
      }
    }
  }

  return null
}
