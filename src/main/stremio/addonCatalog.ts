import type { CatalogItem, CatalogType } from '@shared/stremioTypes'
import { ADDON_REQUEST_HEADERS } from './addonHttp'
import { normalizeAddonUrl } from './streamAddons'

interface AddonMetaPreviewRaw {
  id: string
  name: string
  poster?: string
  description?: string
  year?: string
  releaseInfo?: string
  genres?: string[]
}

interface AddonCatalogResponse {
  metas?: AddonMetaPreviewRaw[]
}

/**
 * Fetches one catalog from a user-configured addon — same /catalog/{type}/{id}.json
 * protocol Cinemeta uses, just against an arbitrary addon base URL instead of the
 * fixed official one, so rows can be pulled from whatever the user's own addons
 * actually declare (not just Cinemeta's Popular/New).
 */
export async function fetchAddonCatalog(
  addonUrl: string,
  type: CatalogType,
  catalogId: string
): Promise<CatalogItem[]> {
  const base = normalizeAddonUrl(addonUrl)
  const response = await fetch(`${base}/catalog/${type}/${encodeURIComponent(catalogId)}.json`, {
    signal: AbortSignal.timeout(10000),
    headers: ADDON_REQUEST_HEADERS
  })
  if (!response.ok) return []

  const data = (await response.json()) as AddonCatalogResponse
  return (data.metas ?? []).map(
    (meta): CatalogItem => ({
      id: meta.id,
      type,
      name: meta.name,
      poster: meta.poster ?? null,
      description: meta.description ?? null,
      year: meta.year ?? meta.releaseInfo ?? null,
      released: null,
      genres: meta.genres ?? []
    })
  )
}
