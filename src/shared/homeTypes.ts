import type { GameEntry } from './steamTypes'
import type { CatalogItem, CatalogType } from './stremioTypes'

export type ContinueSuggestion =
  | { kind: 'game'; title: string; subtitle: string; poster: string | null; game: GameEntry }
  | { kind: 'tv'; title: string; subtitle: string; poster: string | null; tab: CatalogType; item: CatalogItem }
