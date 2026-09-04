import type { CatalogType } from '@shared/stremioTypes'

export interface RawStreamResult {
  title: string
  url?: string
  infoHash?: string
  fileIdx?: number
}

interface RawStreamJson {
  title?: string
  name?: string
  url?: string
  infoHash?: string
  fileIdx?: number
}

interface StreamAddonResponse {
  streams?: RawStreamJson[]
}

/** Accepts either an addon's base URL or its full manifest.json URL — both are commonly shared/copied. */
export function normalizeAddonUrl(addonUrl: string): string {
  return addonUrl.trim().replace(/\/manifest\.json$/, '').replace(/\/$/, '')
}

/** Queries one addon's /stream endpoint — the same open protocol the real Stremio app uses for any addon you add. */
export async function fetchStreamsFromAddon(
  addonBaseUrl: string,
  type: CatalogType,
  id: string
): Promise<RawStreamResult[]> {
  const base = normalizeAddonUrl(addonBaseUrl)
  const url = `${base}/stream/${type}/${encodeURIComponent(id)}.json`

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return []

    const data = (await response.json()) as StreamAddonResponse
    return (data.streams ?? []).map((s) => ({
      title: s.title ?? s.name ?? 'Stream',
      url: s.url,
      infoHash: s.infoHash,
      fileIdx: s.fileIdx
    }))
  } catch {
    return []
  }
}
