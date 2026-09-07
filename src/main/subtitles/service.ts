import type { CatalogType } from '@shared/stremioTypes'
import { loadStremioConfig } from '../stremio/config'
import { normalizeAddonUrl } from '../stremio/streamAddons'
import { encodeStremioId } from '../stremio/streamId'

const OFFICIAL_BASE = 'https://opensubtitles-v3.strem.io'

export interface SubtitleTrack {
  id: string
  lang: string
  url: string
}

interface RawSubtitle {
  id: string
  url: string
  lang: string
}

interface SubtitlesResponse {
  subtitles?: RawSubtitle[]
}

async function fetchFromSource(
  sourceLabel: string,
  baseUrl: string,
  type: CatalogType,
  id: string
): Promise<SubtitleTrack[]> {
  try {
    const response = await fetch(`${baseUrl}/subtitles/${type}/${encodeStremioId(id)}.json`, {
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) return []
    const data = (await response.json()) as SubtitlesResponse
    // Prefixed so two sources returning the same bare id (plausible — both
    // might just number their own results "1", "2", ...) can't collide.
    return (data.subtitles ?? []).map((s) => ({ id: `${sourceLabel}:${s.id}`, lang: s.lang, url: s.url }))
  } catch {
    return []
  }
}

/**
 * Stremio's own official subtitle addon is always queried, plus every
 * user-installed addon that declares the `subtitles` resource — same
 * "declared resource decides what gets queried" pattern getStreamOptions/
 * getAddonCatalogs already use for stream/catalog addons (see
 * stremio/service.ts). Before this, a subtitle addon installed from the
 * Addon Store was silently never queried at all — added to the config,
 * completely inert. All sources run in parallel and merge; a failing or
 * slow addon just contributes nothing, same tolerance every other
 * addon-fanout call in this app already has.
 */
export async function fetchSubtitleTracks(type: CatalogType, id: string): Promise<SubtitleTrack[]> {
  const config = loadStremioConfig()
  const addonSources = config.addons
    .filter((a) => a.resources.includes('subtitles'))
    .map((a) => ({ label: a.name, baseUrl: normalizeAddonUrl(a.url) }))

  const sources = [{ label: 'OpenSubtitles', baseUrl: OFFICIAL_BASE }, ...addonSources]
  const results = await Promise.all(sources.map((s) => fetchFromSource(s.label, s.baseUrl, type, id)))
  return results.flat()
}

/** SRT → WebVTT — the format `<track>` elements require natively. Addons only ever return SRT. */
function srtToVtt(srt: string): string {
  const body = srt.replace(/\r+/g, '').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
  return `WEBVTT\n\n${body}`
}

export async function fetchSubtitleVtt(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) {
    throw new Error(`Subtitle fetch failed with ${response.status}`)
  }
  return srtToVtt(await response.text())
}
