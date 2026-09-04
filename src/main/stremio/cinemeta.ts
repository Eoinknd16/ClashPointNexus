import type { CatalogItem, CatalogType } from '@shared/stremioTypes'

const CINEMETA_BASE = 'https://v3-cinemeta.strem.io'

interface CinemetaMetaRaw {
  id: string
  name: string
  poster?: string
  description?: string
  year?: string
  releaseInfo?: string
  released?: string
  genres?: string[]
}

interface CinemetaCatalogResponse {
  metas?: CinemetaMetaRaw[]
}

interface CinemetaMetaResponse {
  meta?: CinemetaMetaRaw
}

/** Stremio's own official metadata addon — public, no auth, used by the real app's default catalogs. */
export async function fetchCatalog(type: CatalogType, catalogId: string): Promise<CatalogItem[]> {
  const response = await fetch(`${CINEMETA_BASE}/catalog/${type}/${catalogId}.json`)
  if (!response.ok) {
    throw new Error(`Cinemeta responded with ${response.status}`)
  }

  const data = (await response.json()) as CinemetaCatalogResponse
  const metas = data.metas ?? []

  return metas.map(
    (meta): CatalogItem => ({
      id: meta.id,
      type,
      name: meta.name,
      poster: meta.poster ?? null,
      description: meta.description ?? null,
      year: meta.year ?? meta.releaseInfo ?? null,
      released: null, // catalog listings rarely populate this — fetched separately via fetchReleaseDate
      genres: meta.genres ?? []
    })
  )
}

/**
 * Catalog listings usually leave `released` empty (sparse for list performance);
 * the full per-title meta endpoint has it. Fetched lazily once a title is selected.
 */
export async function fetchReleaseDate(type: CatalogType, id: string): Promise<string | null> {
  const response = await fetch(`${CINEMETA_BASE}/meta/${type}/${encodeURIComponent(id)}.json`, {
    signal: AbortSignal.timeout(8000)
  })
  if (!response.ok) return null

  const data = (await response.json()) as CinemetaMetaResponse
  return data.meta?.released ?? null
}
