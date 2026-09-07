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

const TIMESTAMP_PAIR = /(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/g

function parseTimestamp(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000
}

function formatTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds)
  const h = Math.floor(clamped / 3600)
  const m = Math.floor((clamped % 3600) / 60)
  const s = Math.floor(clamped % 60)
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000)
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`
}

/** SRT → WebVTT — the format `<track>` elements require natively. Addons only
 * ever return SRT.
 *
 * `offsetSeconds` rebases every cue for a resumed/seeked video whose own
 * 0:00 is really `offsetSeconds` into the real file (see subtitleTrackUrl's
 * own doc comment for why this has to happen at all) — a cue entirely before
 * the offset is dropped (it can never be reached in the rebased stream), and
 * one straddling it is clamped to start at 0 rather than going negative.
 */
function srtToVtt(srt: string, offsetSeconds: number): string {
  const normalized = srt.replace(/\r+/g, '')
  if (offsetSeconds <= 0) {
    return `WEBVTT\n\n${normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`
  }

  const blocks = normalized.split(/\n\n+/)
  const shifted = blocks
    .map((block) => {
      const match = TIMESTAMP_PAIR.exec(block)
      TIMESTAMP_PAIR.lastIndex = 0
      if (!match) return block
      const start = parseTimestamp(match[1], match[2], match[3], match[4]) - offsetSeconds
      const end = parseTimestamp(match[5], match[6], match[7], match[8]) - offsetSeconds
      if (end <= 0) return null // fully before the resume point -- unreachable now
      return block.replace(TIMESTAMP_PAIR, `${formatTimestamp(start)} --> ${formatTimestamp(end)}`)
    })
    .filter((block): block is string => block !== null)

  return `WEBVTT\n\n${shifted.join('\n\n')}`
}

export async function fetchSubtitleVtt(url: string, offsetSeconds = 0): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) {
    throw new Error(`Subtitle fetch failed with ${response.status}`)
  }
  return srtToVtt(await response.text(), offsetSeconds)
}
