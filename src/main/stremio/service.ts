import type { AddonCatalogRow, CatalogItem, CatalogType, SeriesMeta, StreamResult } from '@shared/stremioTypes'
import { getAllProgressForType } from '../progress/config'
import { fetchAddonCatalog } from './addonCatalog'
import { fetchBasicMeta, fetchCatalog, fetchReleaseDate, fetchSeriesMeta } from './cinemeta'
import { loadStremioConfig } from './config'
import { ensureStremioServer, localStreamUrl } from './server'
import { extractLanguages, extractResolution } from './streamMeta'
import { fetchStreamsFromAddon, type RawStreamResult } from './streamAddons'

const CONTINUE_WATCHING_LIMIT = 25

export async function getCatalog(
  type: CatalogType,
  catalogId: string,
  skip = 0,
  genre?: string
): Promise<CatalogItem[]> {
  return fetchCatalog(type, catalogId, skip, genre)
}

/** Builds catalog-shaped cards from the local progress store — it only keeps ids,
 * so each in-progress title's name/poster is looked up from Cinemeta. */
export async function getContinueWatching(type: CatalogType): Promise<CatalogItem[]> {
  const entries = getAllProgressForType(type).slice(0, CONTINUE_WATCHING_LIMIT)
  const metas = await Promise.all(entries.map((e) => fetchBasicMeta(type, e.id)))

  const items: CatalogItem[] = []
  entries.forEach((entry, i) => {
    const meta = metas[i]
    if (!meta) return
    items.push({
      id: entry.id,
      type,
      name: meta.name,
      poster: meta.poster,
      description: null,
      year: null,
      released: null,
      genres: []
    })
  })
  return items
}

export async function getReleaseDate(type: CatalogType, id: string): Promise<string | null> {
  return fetchReleaseDate(type, id)
}

/** Searches Cinemeta's Popular catalog by title — result sets are small enough
 * (a few dozen at most) that no pagination is needed. */
export async function searchCatalog(type: CatalogType, query: string): Promise<CatalogItem[]> {
  return fetchCatalog(type, 'top', 0, undefined, query)
}

/** Pulls one row per movie/series catalog declared by the user's own catalog-capable
 * addons — a bad/slow addon just drops its own row rather than failing the rest. */
export async function getAddonCatalogs(type: CatalogType): Promise<AddonCatalogRow[]> {
  const config = loadStremioConfig()
  const catalogAddons = config.addons.filter((a) => a.resources.includes('catalog'))

  const tasks = catalogAddons.flatMap((addon) =>
    (addon.catalogs ?? [])
      .filter((c) => c.type === type)
      .map(async (cat): Promise<AddonCatalogRow | null> => {
        try {
          const items = await fetchAddonCatalog(addon.url, type, cat.id)
          if (items.length === 0) return null
          return { key: `addon:${addon.url}:${cat.id}`, label: `${addon.name}: ${cat.name}`, items }
        } catch {
          return null
        }
      })
  )

  const results = await Promise.all(tasks)
  return results.filter((row): row is AddonCatalogRow => row !== null)
}

export async function getSeriesMeta(id: string): Promise<SeriesMeta> {
  return fetchSeriesMeta(id)
}

/** Resolves playable stream URLs for a title via whatever of the user's addons can resolve streams. */
export async function getStreamOptions(type: CatalogType, id: string): Promise<StreamResult> {
  const config = loadStremioConfig()
  const streamAddons = config.addons.filter((a) => a.resources.includes('stream'))
  if (streamAddons.length === 0) {
    return { streams: [], hasAddonsConfigured: false, serverAvailable: false, serverUnavailableReason: null, addonErrors: [] }
  }

  const serverStatus = await ensureStremioServer()

  const perAddon = await Promise.all(
    streamAddons.map(async (addon) => ({
      addon,
      result: await fetchStreamsFromAddon(addon.url, type, id)
    }))
  )

  // Order is intentionally left exactly as your addons are configured (addon order,
  // then that addon's own internal ranking) — this should mirror the real Stremio
  // app's stream list, not get reshuffled by any preference of ours.
  const streams: StreamResult['streams'] = []
  const addonErrors: string[] = []
  for (const { addon, result } of perAddon) {
    if (result.error) addonErrors.push(`${addon.name}: ${result.error}`)
    for (const item of result.raw) {
      streams.push(buildStreamOption(item, addon.name, serverStatus.available))
    }
  }

  return {
    streams,
    hasAddonsConfigured: true,
    serverAvailable: serverStatus.available,
    serverUnavailableReason: serverStatus.reason,
    addonErrors
  }
}

function buildStreamOption(
  raw: RawStreamResult,
  addonName: string,
  serverAvailable: boolean
): StreamResult['streams'][number] {
  const playableUrl = raw.url
    ? raw.url
    : raw.infoHash && serverAvailable
      ? localStreamUrl(raw.infoHash, raw.fileIdx ?? 0)
      : null

  return {
    title: raw.title,
    playableUrl,
    addonName,
    resolution: extractResolution(raw.title),
    languages: extractLanguages(raw.title)
  }
}
