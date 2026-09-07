import type { CatalogType } from '@shared/stremioTypes'
import { STREAMING_SERVICES, type WatchAvailability } from '@shared/streamingProviders'
import { getTmdbApiKey } from './config'

const TMDB_BASE = 'https://api.themoviedb.org/3'
// TMDb's watch-provider data is regional (JustWatch-licensed) and this app
// has no locale setting to key off yet — US is the only region queried for
// now, same "known v1 limitation, not a bug" tradeoff as OMDb ratings only
// ever mattering when the user bothers to set a key at all.
const REGION = 'US'

interface TmdbFindResponse {
  movie_results?: Array<{ id: number }>
  tv_results?: Array<{ id: number }>
}

interface TmdbWatchProvidersResponse {
  results?: Record<string, { flatrate?: Array<{ provider_name: string }> }>
}

function tmdbMediaType(type: CatalogType): 'movie' | 'tv' {
  return type === 'series' ? 'tv' : 'movie'
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

/**
 * Which official streaming services (Netflix, Prime Video, Disney+, ...)
 * currently carry this title as part of a subscription — powers the TV
 * detail panel's "Where to Watch" row (see TvScreen.tsx). This is
 * *metadata only*: it tells Nexus where a title lives, never plays it —
 * actually watching it means handing off to that service's own site/app
 * (openStreamingService in ipc.ts), since none of these can legally be
 * played inside a third-party app (see streamingProviders.ts's own docs on
 * why that's a hard line, not a missing feature).
 *
 * Two calls, since Nexus's own catalog (Cinemeta) keys everything by IMDb
 * id, not TMDb id: /find resolves IMDb -> TMDb id, then /watch/providers
 * looks up availability for that TMDb id. Quietly returns no availability
 * (rather than erroring) whenever the user hasn't set a TMDb key, the title
 * isn't found, or either call fails — this is pure enrichment on top of a
 * detail panel that already works fully without it, same contract as
 * fetchExternalRatings's own OMDb lookup.
 */
export async function getWatchAvailability(imdbId: string, type: CatalogType): Promise<WatchAvailability> {
  const apiKey = getTmdbApiKey()
  if (!apiKey) return { serviceIds: [] }

  const mediaType = tmdbMediaType(type)
  const found = await fetchJson<TmdbFindResponse>(
    `${TMDB_BASE}/find/${encodeURIComponent(imdbId)}?api_key=${encodeURIComponent(apiKey)}&external_source=imdb_id`
  )
  const results = mediaType === 'movie' ? found?.movie_results : found?.tv_results
  const tmdbId = results?.[0]?.id
  if (!tmdbId) return { serviceIds: [] }

  const providers = await fetchJson<TmdbWatchProvidersResponse>(
    `${TMDB_BASE}/${mediaType}/${tmdbId}/watch/providers?api_key=${encodeURIComponent(apiKey)}`
  )
  const flatrate = providers?.results?.[REGION]?.flatrate ?? []
  if (flatrate.length === 0) return { serviceIds: [] }

  const names = new Set(flatrate.map((p) => p.provider_name))
  const serviceIds = STREAMING_SERVICES.filter((service) => service.tmdbNames.some((n) => names.has(n))).map(
    (service) => service.id
  )
  return { serviceIds }
}
