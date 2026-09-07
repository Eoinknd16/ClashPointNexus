import { randomUUID } from 'crypto'
import type { CatalogItem } from '@shared/stremioTypes'
import type { NewTvHomeBlock, ResolvedTvHomeBlock, TvHomeBlock, TvHomeConfig, TvHomePage } from '@shared/tvHomeTypes'
import { fetchAddonCatalog } from '../stremio/addonCatalog'
import { fetchBasicMeta, fetchCatalog } from '../stremio/cinemeta'
import { getContinueWatching } from '../stremio/service'
import { listLibrary } from '../library/config'
import { loadTvHomeConfig, saveTvHomeConfig } from './config'

export function getTvHomeConfig(): TvHomeConfig {
  return loadTvHomeConfig()
}

function findPage(config: TvHomeConfig, pageId: string): TvHomePage | undefined {
  return config.pages.find((p) => p.id === pageId)
}

export function addTvHomePage(name: string): TvHomeConfig {
  const config = loadTvHomeConfig()
  const page: TvHomePage = { id: randomUUID(), name: name.trim() || 'New Page', blocks: [] }
  const next: TvHomeConfig = { pages: [...config.pages, page], activePageId: page.id }
  saveTvHomeConfig(next)
  return next
}

/** Always keeps at least one page — the whole feature has nowhere to render
 * with zero, and deleting the last one would need a fresh empty one created
 * right back anyway. */
export function removeTvHomePage(pageId: string): TvHomeConfig {
  const config = loadTvHomeConfig()
  if (config.pages.length <= 1) return config
  const pages = config.pages.filter((p) => p.id !== pageId)
  const activePageId = config.activePageId === pageId ? pages[0].id : config.activePageId
  const next: TvHomeConfig = { pages, activePageId }
  saveTvHomeConfig(next)
  return next
}

export function renameTvHomePage(pageId: string, name: string): TvHomeConfig {
  const config = loadTvHomeConfig()
  const trimmed = name.trim()
  if (!trimmed) return config
  const pages = config.pages.map((p) => (p.id === pageId ? { ...p, name: trimmed } : p))
  const next: TvHomeConfig = { ...config, pages }
  saveTvHomeConfig(next)
  return next
}

export function setActiveTvHomePage(pageId: string): TvHomeConfig {
  const config = loadTvHomeConfig()
  if (!findPage(config, pageId)) return config
  const next: TvHomeConfig = { ...config, activePageId: pageId }
  saveTvHomeConfig(next)
  return next
}

export function addTvHomeBlock(pageId: string, block: NewTvHomeBlock): TvHomeConfig {
  const config = loadTvHomeConfig()
  const pages = config.pages.map((p) =>
    p.id === pageId ? { ...p, blocks: [...p.blocks, { ...block, id: randomUUID() } as TvHomeBlock] } : p
  )
  const next: TvHomeConfig = { ...config, pages }
  saveTvHomeConfig(next)
  return next
}

export function removeTvHomeBlock(pageId: string, blockId: string): TvHomeConfig {
  const config = loadTvHomeConfig()
  const pages = config.pages.map((p) =>
    p.id === pageId ? { ...p, blocks: p.blocks.filter((b) => b.id !== blockId) } : p
  )
  const next: TvHomeConfig = { ...config, pages }
  saveTvHomeConfig(next)
  return next
}

/** Swaps a block with its immediate up/down neighbor — the entire reorder
 * vocabulary this page needs (move up, move down), driven by Edit Mode's
 * grab/move/drop interaction (see TvHomePage.tsx). A no-op at either end of
 * the list rather than wrapping around, which would be a confusing way for
 * a "move up" to suddenly jump a block to the bottom. */
export function moveTvHomeBlock(pageId: string, blockId: string, direction: -1 | 1): TvHomeConfig {
  const config = loadTvHomeConfig()
  const pages = config.pages.map((p) => {
    if (p.id !== pageId) return p
    const index = p.blocks.findIndex((b) => b.id === blockId)
    const targetIndex = index + direction
    if (index === -1 || targetIndex < 0 || targetIndex >= p.blocks.length) return p
    const blocks = [...p.blocks]
    ;[blocks[index], blocks[targetIndex]] = [blocks[targetIndex], blocks[index]]
    return { ...p, blocks }
  })
  const next: TvHomeConfig = { ...config, pages }
  saveTvHomeConfig(next)
  return next
}

async function resolveRow(
  id: string,
  label: string,
  source: Extract<TvHomeBlock, { kind: 'row' }>['source']
): Promise<ResolvedTvHomeBlock> {
  try {
    let items: CatalogItem[] = []
    if (source.kind === 'catalog') {
      items = await fetchCatalog(source.catalogType, source.catalogId, 0, source.genre)
    } else if (source.kind === 'addonCatalog') {
      items = await fetchAddonCatalog(source.addonUrl, source.catalogType, source.catalogId)
    } else if (source.kind === 'continueWatching') {
      const [movies, series] = await Promise.all([getContinueWatching('movie'), getContinueWatching('series')])
      items = [...movies, ...series]
    } else {
      items = listLibrary().map((e) => ({
        id: e.id,
        type: e.type,
        name: e.name,
        poster: e.poster,
        description: null,
        year: null,
        released: null,
        genres: []
      }))
    }
    return { id, kind: 'row', label, items }
  } catch {
    return { id, kind: 'row', label, items: [] }
  }
}

async function resolveCard(
  id: string,
  card: Extract<TvHomeBlock, { kind: 'card' }>['card'],
  pages: TvHomePage[]
): Promise<ResolvedTvHomeBlock> {
  if (card.kind === 'pinnedTitle') {
    const meta = await fetchBasicMeta(card.type, card.id).catch(() => null)
    const item: CatalogItem | null = meta
      ? {
          id: card.id,
          type: card.type,
          name: meta.name,
          poster: meta.poster,
          description: null,
          year: null,
          released: null,
          genres: []
        }
      : null
    return { id, kind: 'card', card: { kind: 'pinnedTitle', item } }
  }
  if (card.kind === 'tabShortcut') {
    return { id, kind: 'card', card: { kind: 'tabShortcut', tab: card.tab } }
  }
  const page = pages.find((p) => p.id === card.pageId)
  return { id, kind: 'card', card: { kind: 'pageShortcut', pageId: card.pageId, pageName: page?.name ?? null } }
}

/** Resolves every block on one page into actual, renderable content — real
 * CatalogItems for rows, real title/name lookups for pinned-title cards.
 * All blocks resolve in parallel; one block failing (a dead addon catalog,
 * a pinned title that's since vanished) never blocks the others — same
 * tolerance every other addon/catalog fanout in this app already has. */
export async function resolveTvHomePage(pageId: string): Promise<ResolvedTvHomeBlock[]> {
  const config = loadTvHomeConfig()
  const page = findPage(config, pageId)
  if (!page) return []

  return Promise.all(
    page.blocks.map((block) =>
      block.kind === 'row'
        ? resolveRow(block.id, block.label, block.source)
        : resolveCard(block.id, block.card, config.pages)
    )
  )
}
