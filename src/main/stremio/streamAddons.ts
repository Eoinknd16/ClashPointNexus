import type { CatalogType } from '@shared/stremioTypes'
import { ADDON_REQUEST_HEADERS } from './addonHttp'
import { encodeStremioId } from './streamId'

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

export interface AddonStreamsResult {
  raw: RawStreamResult[]
  /** Null on a normal "queried fine, addon just had nothing" result — a
   * non-2xx response, a network failure, or bad JSON all count as an error,
   * distinct from a genuinely empty streams array, so a total playback
   * failure can say *why* instead of leaving every addon looking identical
   * to "no matches". */
  error: string | null
}

/** Accepts either an addon's base URL or its full manifest.json URL — both are commonly shared/copied. */
export function normalizeAddonUrl(addonUrl: string): string {
  return addonUrl.trim().replace(/\/manifest\.json$/, '').replace(/\/$/, '')
}

/** Node's fetch (undici) throws a generic "fetch failed" TypeError for most
 * network-level failures, with the actually-useful reason (DNS failure,
 * connection refused, a TLS error, ...) nested one level down in `cause` —
 * surfacing only `.message` makes every such failure look identical and
 * gives nothing to act on. */
function describeFetchError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause
    if (cause instanceof Error) return `${error.message}: ${cause.message}`
    if (cause) return `${error.message}: ${String(cause)}`
    return error.message
  }
  return String(error)
}

/** Queries one addon's /stream endpoint — the same open protocol the real Stremio app uses for any addon you add. */
export async function fetchStreamsFromAddon(
  addonBaseUrl: string,
  type: CatalogType,
  id: string
): Promise<AddonStreamsResult> {
  const base = normalizeAddonUrl(addonBaseUrl)
  const url = `${base}/stream/${type}/${encodeStremioId(id)}.json`

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: ADDON_REQUEST_HEADERS })
    if (!response.ok) return { raw: [], error: `HTTP ${response.status}` }

    const data = (await response.json()) as StreamAddonResponse
    const raw = (data.streams ?? []).map((s) => ({
      title: s.title ?? s.name ?? 'Stream',
      url: s.url,
      infoHash: s.infoHash,
      fileIdx: s.fileIdx
    }))
    return { raw, error: null }
  } catch (error) {
    return { raw: [], error: describeFetchError(error) }
  }
}
