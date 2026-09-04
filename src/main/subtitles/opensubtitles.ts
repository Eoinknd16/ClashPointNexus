import type { CatalogType } from '@shared/stremioTypes'

const BASE = 'https://opensubtitles-v3.strem.io'

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

/** Stremio's own official subtitle addon — public, no auth, same tier as Cinemeta. */
export async function fetchSubtitleTracks(type: CatalogType, id: string): Promise<SubtitleTrack[]> {
  const response = await fetch(`${BASE}/subtitles/${type}/${encodeURIComponent(id)}.json`, {
    signal: AbortSignal.timeout(8000)
  })
  if (!response.ok) return []

  const data = (await response.json()) as SubtitlesResponse
  return (data.subtitles ?? []).map((s) => ({ id: s.id, lang: s.lang, url: s.url }))
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
