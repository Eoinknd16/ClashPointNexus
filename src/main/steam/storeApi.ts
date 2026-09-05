import type { GameStoreInfo } from '@shared/steamTypes'

interface AppDetailsRaw {
  short_description?: string
  genres?: Array<{ description?: string }>
  release_date?: { date?: string }
  metacritic?: { score?: number }
  developers?: string[]
  publishers?: string[]
  categories?: Array<{ id?: number }>
}

interface AppDetailsResponse {
  [appId: string]: { success: boolean; data?: AppDetailsRaw }
}

// Steam's storefront "categories" ids for controller support — undocumented
// by Valve but stable/community-verified, same footing as the ACF
// StateFlags bitmask this app already parses elsewhere for update status.
const CATEGORY_FULL_CONTROLLER_SUPPORT = 28
const CATEGORY_PARTIAL_CONTROLLER_SUPPORT = 18

function controllerSupportFrom(categories: Array<{ id?: number }> | undefined): 'full' | 'partial' | 'none' {
  const ids = new Set((categories ?? []).map((c) => c.id))
  if (ids.has(CATEGORY_FULL_CONTROLLER_SUPPORT)) return 'full'
  if (ids.has(CATEGORY_PARTIAL_CONTROLLER_SUPPORT)) return 'partial'
  return 'none'
}

/** store.steampowered.com is Steam's public storefront API — unlike
 * api.steampowered.com, it needs no key at all. Used purely for descriptive
 * detail-panel info (genres, description, release date, Metacritic score),
 * never for anything the user's own library/playtime depends on. */
export async function fetchAppDetails(appId: number): Promise<GameStoreInfo | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return null
    const data = (await response.json()) as AppDetailsResponse
    const entry = data[String(appId)]
    if (!entry?.success || !entry.data) return null
    const d = entry.data
    return {
      description: d.short_description ?? null,
      genres: (d.genres ?? []).map((g) => g.description).filter((g): g is string => Boolean(g)),
      releaseDate: d.release_date?.date ?? null,
      metacriticScore: d.metacritic?.score ?? null,
      developers: d.developers ?? [],
      publishers: d.publishers ?? [],
      controllerSupport: controllerSupportFrom(d.categories)
    }
  } catch {
    return null
  }
}
