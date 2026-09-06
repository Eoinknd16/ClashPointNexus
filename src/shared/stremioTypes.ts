export type CatalogType = 'movie' | 'series'

export interface CatalogItem {
  id: string
  type: CatalogType
  name: string
  poster: string | null
  description: string | null
  year: string | null
  /** Full release date (ISO string) — only populated once the item's full meta has been fetched. */
  released: string | null
  genres: string[]
}

export interface StreamOption {
  title: string
  playableUrl: string | null
  /** Name of the addon that resolved this stream, e.g. "Debridio - Scraper TB". */
  addonName: string
  /** Best-effort, parsed from the title/filename — e.g. "4K", "1080p". */
  resolution: string | null
  /** Best-effort, parsed from the title/filename — e.g. ["English", "Russian"]. */
  languages: string[]
}

export interface StreamResult {
  streams: StreamOption[]
  hasAddonsConfigured: boolean
  serverAvailable: boolean
  /** Why the local torrent-streaming server isn't available, when it isn't —
   * null whenever serverAvailable is true. Surfaced directly in the UI so a
   * total "nothing plays" failure has an actual reason instead of a guess. */
  serverUnavailableReason: string | null
  /** One entry per stream addon that errored while being queried (network
   * failure, non-2xx response, bad JSON) — an addon returning zero streams
   * with no error is not included, since that's a normal "nothing found"
   * result, not a failure. */
  addonErrors: string[]
}

export interface AddonSummary {
  name: string
  url: string
  /** e.g. ["stream"], ["catalog", "meta"], ["subtitles"] — from the addon's own manifest. */
  resources: string[]
  /** Movie/series catalogs this addon declares, if any — lets us pull rows from
   * the user's own addons instead of only Cinemeta's defaults. */
  catalogs?: Array<{ type: CatalogType; id: string; name: string }>
}

/** One addon-sourced catalog, ready to render as a row. */
export interface AddonCatalogRow {
  key: string
  label: string
  items: CatalogItem[]
}

export interface EpisodeItem {
  /** Full Stremio video id, e.g. "tt1520211:1:4" — what getStreams/getTracks expect. */
  id: string
  season: number
  episode: number
  name: string
  overview: string | null
  thumbnail: string | null
  released: string | null
}

export interface SeriesMeta {
  released: string | null
  episodes: EpisodeItem[]
}

/** Cast/director/runtime/IMDb rating come free from Cinemeta's own meta
 * response (the same one already fetched for the release date) — no extra
 * dependency. externalRatings (Rotten Tomatoes, Metacritic, etc.) is the one
 * part that needs the user's own free OMDb API key configured in Settings;
 * it's simply empty when none is set, not an error. */
export interface ExtendedMeta {
  cast: string[]
  director: string[]
  runtime: string | null
  imdbRating: string | null
  externalRatings: Array<{ source: string; value: string }>
}

/** Season/episode number order — season 0 ("Specials") sorts last, not first. */
export function seasonSortKey(season: number): number {
  return season === 0 ? Number.POSITIVE_INFINITY : season
}
