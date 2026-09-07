import type { CommunityAddon } from '@shared/stremioTypes'
import { normalizeAddonUrl } from './streamAddons'

// Stremio's own official public addon collection — the exact same data its
// own "Community Addons" browsing pulls from, not something this project
// curates or hosts. Read-only, unauthenticated, no API key needed.
const COLLECTION_URL = 'https://api.strem.io/addonscollection.json'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour — this list changes rarely; no reason to re-fetch ~300KB every time the store opens.

interface RawResource {
  name: string
}

interface RawManifest {
  id?: string
  name?: string
  description?: string
  logo?: string
  types?: string[]
  resources?: Array<string | RawResource>
}

interface RawEntry {
  transportUrl?: string
  manifest?: RawManifest
}

let cache: { addons: CommunityAddon[]; fetchedAt: number } | null = null

function resourceName(r: string | RawResource): string {
  return typeof r === 'string' ? r : r.name
}

/**
 * Lists every addon in Stremio's public collection — powers the searchable
 * Addon Store (see TvScreen.tsx's addonStore zone). Best-effort and cached:
 * a failed fetch falls back to whatever was last cached (even if stale)
 * rather than leaving the store empty over a transient network hiccup, and
 * only an outright first-ever failure (nothing cached yet) results in an
 * empty list — same "quietly degrade, never throw into the UI" contract as
 * every other optional enrichment in this app (OMDb ratings, TMDb watch
 * availability, community themes).
 *
 * transportUrl is normalized here (same helper streamAddons.ts's own
 * fetch path uses) so it's directly comparable against an already-installed
 * AddonSummary.url without the renderer needing to know anything about
 * addon URL shapes.
 */
export async function listCommunityAddons(): Promise<CommunityAddon[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.addons

  try {
    const response = await fetch(COLLECTION_URL, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) return cache?.addons ?? []
    const raw = (await response.json()) as RawEntry[]
    const addons: CommunityAddon[] = raw
      .filter((e): e is RawEntry & { transportUrl: string; manifest: RawManifest & { id: string; name: string } } =>
        Boolean(e.transportUrl && e.manifest?.id && e.manifest?.name)
      )
      .map((e) => ({
        id: e.manifest.id,
        name: e.manifest.name,
        description: e.manifest.description ?? '',
        logo: e.manifest.logo ?? null,
        types: e.manifest.types ?? [],
        resources: (e.manifest.resources ?? []).map(resourceName),
        transportUrl: normalizeAddonUrl(e.transportUrl)
      }))
    cache = { addons, fetchedAt: Date.now() }
    return addons
  } catch {
    return cache?.addons ?? []
  }
}
