import type { GameEntry } from './steamTypes'
import type { CatalogItem, CatalogType } from './stremioTypes'

export type ContinueSuggestion =
  | { kind: 'game'; title: string; subtitle: string; poster: string | null; progressPercent: null; game: GameEntry }
  | {
      kind: 'tv'
      title: string
      subtitle: string
      poster: string | null
      /** 0-100, or null if the title has no known duration to measure against. */
      progressPercent: number | null
      tab: CatalogType
      item: CatalogItem
    }

/** Counts for Home's stats card -- computed main-side so Home doesn't pull
 * the full Steam library and watch library across IPC just to count them. */
export interface HomeLibraryStats {
  movies: number
  series: number
  games: number
}
