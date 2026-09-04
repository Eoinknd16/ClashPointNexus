import type { CatalogType } from './stremioTypes'

/**
 * One entry per movie/series, keyed by (type, id) in storage. For a series,
 * `id` is the series' own id (not an episode id) — season/episode/episodeId
 * are the "last watched" pointer, so there's a single resume target per show
 * rather than per-episode history.
 */
export interface WatchProgress {
  type: CatalogType
  id: string
  positionSeconds: number
  durationSeconds: number | null
  season?: number
  episode?: number
  episodeId?: string
  updatedAt: number
}
