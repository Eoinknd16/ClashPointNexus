import type { CatalogType } from './stremioTypes'

/** A manually-added movie/series, saved denormalized (own name/poster) so the
 * library list doesn't depend on the title still appearing in any catalog. */
export interface LibraryEntry {
  type: CatalogType
  id: string
  name: string
  poster: string | null
  addedAt: number
}
