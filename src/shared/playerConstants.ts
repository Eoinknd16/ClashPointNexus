export const TRANSCODE_PROXY_PORT = 11471

export interface AudioTrackInfo {
  index: number
  language: string | null
  title: string | null
}

export interface VideoCodecInfo {
  name: string | null
  profile: string | null
  level: number | null
}

export interface MediaInfo {
  duration: number | null
  audioTracks: AudioTrackInfo[]
  videoCodec: VideoCodecInfo | null
}

/**
 * Many resolved streams (BluRay remuxes especially) carry DTS/TrueHD/AC3 audio
 * that Chromium's <video> element cannot decode at all — video plays, audio is
 * silently dropped. Routing every stream through this local proxy, which uses
 * ffmpeg to copy the video track untouched and re-encode only the audio to AAC,
 * is the actual fix rather than a workaround. audioStreamIndex, when known,
 * explicitly selects an English (or otherwise preferred) audio track instead of
 * whatever ffmpeg would default to for a multi-audio-track file.
 */
export function transcodedStreamUrl(sourceUrl: string, startSeconds = 0, audioStreamIndex?: number): string {
  const params = new URLSearchParams({ url: sourceUrl, t: String(startSeconds) })
  if (audioStreamIndex !== undefined) params.set('audio', String(audioStreamIndex))
  return `http://127.0.0.1:${TRANSCODE_PROXY_PORT}/stream?${params.toString()}`
}

/**
 * Serves the addon's subtitle (always SRT) converted to WebVTT directly from our
 * own already-trusted local origin — simpler and more robust than a renderer-side
 * blob: URL, which dynamically-added <track> elements don't always pick up reliably.
 */
export function subtitleTrackUrl(sourceUrl: string): string {
  const params = new URLSearchParams({ url: sourceUrl })
  return `http://127.0.0.1:${TRANSCODE_PROXY_PORT}/subtitle?${params.toString()}`
}
