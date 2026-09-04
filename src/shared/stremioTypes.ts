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
}
