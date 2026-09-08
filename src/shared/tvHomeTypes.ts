import type { CatalogType } from './stremioTypes'

/** Where a row's items come from — each variant maps directly onto an
 * already-existing fetch this app has elsewhere (built-in Cinemeta catalogs
 * power Movies/Series today; addon catalogs are what configured addons
 * (Settings > Plugins > TV Addons) contribute; continueWatching/library
 * power the Library tab) — this page doesn't
 * introduce a new data source, just lets the user choose which of the
 * existing ones shows up, and where. */
export type TvHomeRowSource =
  | { kind: 'catalog'; catalogType: CatalogType; catalogId: 'top' | 'year' | 'imdbRating'; genre?: string }
  | { kind: 'addonCatalog'; addonUrl: string; catalogType: CatalogType; catalogId: string }
  | { kind: 'continueWatching' }
  | { kind: 'library' }

/** A single prominent card rather than a scrolling row. */
export type TvHomeCard =
  | { kind: 'pinnedTitle'; id: string; type: CatalogType }
  | { kind: 'tabShortcut'; tab: 'movie' | 'series' | 'library' }
  | { kind: 'pageShortcut'; pageId: string }

export type TvHomeBlock =
  | { id: string; kind: 'row'; label: string; source: TvHomeRowSource }
  | { id: string; kind: 'card'; card: TvHomeCard }

/** Plain `Omit<TvHomeBlock, 'id'>` doesn't distribute over the union the way
 * you'd want — Omit is defined via Pick<T, Exclude<keyof T, K>>, and keyof
 * over a union only keeps *shared* keys, so it silently collapses down to
 * `{ kind, label? source? card? }` instead of "either row-without-id or
 * card-without-id". This is the actual distributive version, used for
 * "the payload a caller sends when creating a new block" everywhere
 * (addBlock's IPC signature, TvHomePage.tsx's construction of one). */
export type NewTvHomeBlock = TvHomeBlock extends infer B
  ? B extends { id: string }
    ? Omit<B, 'id'>
    : never
  : never

export interface TvHomePage {
  id: string
  name: string
  blocks: TvHomeBlock[]
}

export interface TvHomeConfig {
  pages: TvHomePage[]
  activePageId: string
}

/** One resolved block ready to render — rows carry real CatalogItems (or an
 * error/empty explanation), cards carry whatever minimal display info they
 * need. Resolution happens in the main process (same place every other
 * catalog/library/addon fetch already lives) so the renderer never needs to
 * know how to reach Cinemeta/addons/the progress store itself. */
export type ResolvedTvHomeBlock =
  | { id: string; kind: 'row'; label: string; items: import('./stremioTypes').CatalogItem[] }
  | {
      id: string
      kind: 'card'
      card:
        | { kind: 'pinnedTitle'; item: import('./stremioTypes').CatalogItem | null }
        | { kind: 'tabShortcut'; tab: 'movie' | 'series' | 'library' }
        | { kind: 'pageShortcut'; pageId: string; pageName: string | null }
    }
