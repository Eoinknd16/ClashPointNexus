import type { CatalogType } from '@shared/stremioTypes'
import { ADDON_REQUEST_HEADERS } from './addonHttp'
import { normalizeAddonUrl } from './streamAddons'

interface AddonMetaDetailRaw {
  description?: string
  imdbRating?: string
}

interface AddonMetaResponse {
  meta?: AddonMetaDetailRaw
}

export interface AddonMetaEnrichment {
  description: string | null
  imdbRating: string | null
}

/** One meta-resource addon's own /meta/{type}/{id}.json — same protocol
 * Cinemeta uses (see cinemeta.ts's fetchMetaRaw), just against an arbitrary
 * addon base URL. Failure of any kind (network, non-2xx, bad JSON) is
 * silently treated as "nothing from this one", same tolerance every other
 * addon-fanout call in this app already has. */
async function fetchOne(addonUrl: string, type: CatalogType, id: string): Promise<AddonMetaEnrichment | null> {
  try {
    const base = normalizeAddonUrl(addonUrl)
    const response = await fetch(`${base}/meta/${type}/${encodeURIComponent(id)}.json`, {
      signal: AbortSignal.timeout(8000),
      headers: ADDON_REQUEST_HEADERS
    })
    if (!response.ok) return null
    const data = (await response.json()) as AddonMetaResponse
    if (!data.meta) return null
    return { description: data.meta.description ?? null, imdbRating: data.meta.imdbRating ?? null }
  } catch {
    return null
  }
}

/**
 * Queries every given meta-resource addon in parallel and backfills
 * whichever fields Cinemeta's own response left empty — see
 * stremio/service.ts's getExtendedMeta, the only caller. Deliberately never
 * overrides a field Cinemeta already populated: third-party "meta" addons
 * (ratings enrichment, deep-dive companions, etc.) vary wildly in
 * completeness and accuracy, so Cinemeta stays authoritative whenever it
 * has an answer at all — this only fills genuine gaps. Each field is
 * backfilled independently from whichever addon happens to have it, rather
 * than requiring one addon to supply everything.
 */
export async function fetchAddonMetaBackfill(
  addonUrls: string[],
  type: CatalogType,
  id: string
): Promise<AddonMetaEnrichment> {
  if (addonUrls.length === 0) return { description: null, imdbRating: null }
  const results = await Promise.all(addonUrls.map((url) => fetchOne(url, type, id)))
  const description = results.find((r) => r?.description)?.description ?? null
  const imdbRating = results.find((r) => r?.imdbRating)?.imdbRating ?? null
  return { description, imdbRating }
}
