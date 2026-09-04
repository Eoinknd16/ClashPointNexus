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

/** Season/episode number order — season 0 ("Specials") sorts last, not first. */
export function seasonSortKey(season: number): number {
  return season === 0 ? Number.POSITIVE_INFINITY : season
}
