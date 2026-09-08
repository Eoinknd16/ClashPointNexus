import type { AddonSummary, CatalogType } from '@shared/stremioTypes'
import { ADDON_REQUEST_HEADERS } from './addonHttp'
import { normalizeAddonUrl } from './streamAddons'

interface AddonResource {
  name: string
}

interface AddonManifestCatalog {
  type?: string
  id?: string
  name?: string
}

interface AddonManifest {
  name?: string
  resources?: Array<string | AddonResource>
  catalogs?: AddonManifestCatalog[]
}

function resourceNames(manifest: AddonManifest): string[] {
  return (manifest.resources ?? []).map((r) => (typeof r === 'string' ? r : r.name))
}

/** Only movie/series catalogs — other addon-declared types (channel, tv, etc.) aren't supported yet. */
function extractCatalogs(manifest: AddonManifest): NonNullable<AddonSummary['catalogs']> {
  return (manifest.catalogs ?? [])
    .filter(
      (c): c is AddonManifestCatalog & { type: CatalogType; id: string } =>
        (c.type === 'movie' || c.type === 'series') && typeof c.id === 'string'
    )
    .map((c) => ({ type: c.type, id: c.id, name: c.name ?? c.id }))
}

/** Fetches an addon's manifest.json directly — used when a user manually adds
 * an addon URL (Settings > Plugins > TV Addons). */
export async function fetchAddonManifestInfo(
  addonUrl: string
): Promise<{ name: string; resources: string[]; catalogs: NonNullable<AddonSummary['catalogs']> }> {
  const base = normalizeAddonUrl(addonUrl)
  const response = await fetch(`${base}/manifest.json`, {
    signal: AbortSignal.timeout(8000),
    headers: ADDON_REQUEST_HEADERS
  })
  if (!response.ok) throw new Error(`Addon manifest fetch failed with ${response.status}`)
  const data = (await response.json()) as AddonManifest
  return {
    name: data.name ?? new URL(base).host,
    resources: resourceNames(data),
    catalogs: extractCatalogs(data)
  }
}
