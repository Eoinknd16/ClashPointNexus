import { seasonSortKey } from '@shared/stremioTypes'
import type { CatalogItem, CatalogType, EpisodeItem, SeriesMeta } from '@shared/stremioTypes'

const CINEMETA_BASE = 'https://v3-cinemeta.strem.io'

interface CinemetaVideoRaw {
  id?: string
  season?: number
  episode?: number
  name?: string
  title?: string
  overview?: string
  thumbnail?: string
  released?: string
}

interface CinemetaMetaRaw {
  id: string
  name: string
  poster?: string
  description?: string
  year?: string
  releaseInfo?: string
  released?: string
  genres?: string[]
  videos?: CinemetaVideoRaw[]
  cast?: string[]
  director?: string[]
  runtime?: string
  imdbRating?: string
  imdb_id?: string
}

interface CinemetaCatalogResponse {
  metas?: CinemetaMetaRaw[]
}

interface CinemetaMetaResponse {
  meta?: CinemetaMetaRaw
}

/**
 * Stremio's own official metadata addon — public, no auth, used by the real app's
 * default catalogs. `skip` pages through Cinemeta's full catalog (each page is ~50
 * items), and `genre` filters it (also how the "year" catalog picks a year, since
 * that extra is required there) — the addon protocol appends extra properties as
 * /{property}={value}[&{property}={value}...] path segments, e.g.
 * /catalog/movie/top/genre=Action&skip=50.json.
 */
export async function fetchCatalog(
  type: CatalogType,
  catalogId: string,
  skip = 0,
  genre?: string,
  search?: string
): Promise<CatalogItem[]> {
  const parts: string[] = []
  if (search) parts.push(`search=${encodeURIComponent(search)}`)
  if (genre) parts.push(`genre=${encodeURIComponent(genre)}`)
  if (skip > 0) parts.push(`skip=${skip}`)
  const suffix = parts.length > 0 ? `/${parts.join('&')}` : ''
  const response = await fetch(`${CINEMETA_BASE}/catalog/${type}/${catalogId}${suffix}.json`, {
    signal: AbortSignal.timeout(10000)
  })
  if (!response.ok) {
    throw new Error(`Cinemeta responded with ${response.status}`)
  }

  const data = (await response.json()) as CinemetaCatalogResponse
  const metas = data.metas ?? []

  return metas.map(
    (meta): CatalogItem => ({
      id: meta.id,
      type,
      name: meta.name,
      poster: meta.poster ?? null,
      description: meta.description ?? null,
      year: meta.year ?? meta.releaseInfo ?? null,
      released: null, // catalog listings rarely populate this — fetched separately via fetchReleaseDate
      genres: meta.genres ?? []
    })
  )
}

// Title metadata barely changes within a session — cached (including in-flight
// requests, so N concurrent callers for the same id share one fetch) rather
// than re-hit on every Continue Watching refresh or repeat detail-panel open.
const metaCache = new Map<string, Promise<CinemetaMetaRaw | null>>()

async function fetchMetaRaw(type: CatalogType, id: string): Promise<CinemetaMetaRaw | null> {
  const cacheKey = `${type}:${id}`
  const cached = metaCache.get(cacheKey)
  if (cached) return cached

  const promise = (async (): Promise<CinemetaMetaRaw | null> => {
    const response = await fetch(`${CINEMETA_BASE}/meta/${type}/${encodeURIComponent(id)}.json`, {
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) return null
    const data = (await response.json()) as CinemetaMetaResponse
    return data.meta ?? null
  })()

  metaCache.set(cacheKey, promise)
  // A failed fetch shouldn't be cached forever — let the next call retry.
  promise.catch(() => metaCache.delete(cacheKey))
  return promise
}

/**
 * Catalog listings usually leave `released` empty (sparse for list performance);
 * the full per-title meta endpoint has it. Fetched lazily once a title is selected.
 */
export async function fetchReleaseDate(type: CatalogType, id: string): Promise<string | null> {
  const meta = await fetchMetaRaw(type, id)
  return meta?.released ?? null
}

/** Name + poster for a single title — used to render Continue Watching cards,
 * since the progress store only keeps ids, not display data. */
export async function fetchBasicMeta(
  type: CatalogType,
  id: string
): Promise<{ name: string; poster: string | null } | null> {
  const meta = await fetchMetaRaw(type, id)
  if (!meta) return null
  return { name: meta.name, poster: meta.poster ?? null }
}

/** Cast/director/runtime/IMDb rating/description — all already present on
 * the same Cinemeta meta response fetchReleaseDate uses, just not read
 * before now. description is included so the detail panel can backfill it
 * the same way it already backfills release date — some entry points
 * (Continue Watching, Library, search results) never populate it on the
 * CatalogItem passed in, but this same request has it regardless.
 * imdbId is usually just `id` itself (Cinemeta ids for movie/series already
 * are IMDb ids), but reads Cinemeta's own imdb_id when present in case that
 * ever isn't true, since it's what OMDb's ratings lookup needs. */
export async function fetchCastAndCrew(
  type: CatalogType,
  id: string
): Promise<{
  cast: string[]
  director: string[]
  runtime: string | null
  imdbRating: string | null
  imdbId: string | null
  description: string | null
}> {
  const meta = await fetchMetaRaw(type, id)
  return {
    cast: meta?.cast ?? [],
    director: meta?.director ?? [],
    runtime: meta?.runtime ?? null,
    description: meta?.description ?? null,
    imdbRating: meta?.imdbRating ?? null,
    imdbId: meta?.imdb_id ?? id
  }
}

/** Series meta's `videos` array is Cinemeta's season/episode list — fetched once per
 * series (not per-episode), covering both the release date and the full episode picker. */
export async function fetchSeriesMeta(id: string): Promise<SeriesMeta> {
  const meta = await fetchMetaRaw('series', id)
  const videos = meta?.videos ?? []

  const episodes: EpisodeItem[] = videos
    .filter(
      (v): v is CinemetaVideoRaw & { id: string; season: number; episode: number } =>
        typeof v.id === 'string' && typeof v.season === 'number' && typeof v.episode === 'number'
    )
    .map((v) => ({
      id: v.id,
      season: v.season,
      episode: v.episode,
      name: v.name ?? v.title ?? `Episode ${v.episode}`,
      overview: v.overview ?? null,
      thumbnail: v.thumbnail ?? null,
      released: v.released ?? null
    }))
    .sort((a, b) => seasonSortKey(a.season) - seasonSortKey(b.season) || a.episode - b.episode)

  return { released: meta?.released ?? null, episodes }
}
