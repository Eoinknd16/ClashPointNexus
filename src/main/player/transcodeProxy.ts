import { type ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { existsSync } from 'fs'
import { createServer, type Server } from 'http'
import { join } from 'path'
import { TRANSCODE_PROXY_PORT, type MediaInfo } from '@shared/playerConstants'
import { fetchSubtitleVtt } from '../subtitles/opensubtitles'
import { findStremioInstallDir } from '../stremio/paths'

let server: Server | null = null
let currentProcess: ChildProcessWithoutNullStreams | null = null

function binaryPath(name: string): string | null {
  const dir = findStremioInstallDir()
  if (!dir) return null
  const exe = join(dir, name)
  return existsSync(exe) ? exe : null
}

function killCurrent(): void {
  currentProcess?.kill('SIGKILL')
  currentProcess = null
}

/** Duration + audio tracks + video codec info, in one ffprobe pass — powers the progress bar, English-track selection, and MSE codec-string construction. */
export async function probeMediaInfo(sourceUrl: string): Promise<MediaInfo> {
  const empty: MediaInfo = { duration: null, audioTracks: [], videoCodec: null }
  const ffprobe = binaryPath('ffprobe.exe')
  if (!ffprobe) return empty

  return new Promise((resolve) => {
    const proc = spawn(
      ffprobe,
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', sourceUrl],
      { windowsHide: true }
    )
    let out = ''
    const timeout = setTimeout(() => {
      proc.kill()
      resolve(empty)
    }, 12000)

    proc.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf-8')
    })
    proc.on('close', () => {
      clearTimeout(timeout)
      try {
        const data = JSON.parse(out) as {
          format?: { duration?: string }
          streams?: Array<{
            index: number
            codec_type: string
            codec_name?: string
            profile?: string
            level?: number
            tags?: { language?: string; title?: string }
          }>
        }
        const duration = Number(data.format?.duration)
        const streams = data.streams ?? []
        const audioTracks = streams
          .filter((s) => s.codec_type === 'audio')
          .map((s) => ({
            index: s.index,
            language: s.tags?.language ?? null,
            title: s.tags?.title ?? null
          }))
        const videoStream = streams.find((s) => s.codec_type === 'video')
        const videoCodec = videoStream
          ? {
              name: videoStream.codec_name ?? null,
              profile: videoStream.profile ?? null,
              level: videoStream.level ?? null
            }
          : null
        resolve({ duration: Number.isFinite(duration) ? duration : null, audioTracks, videoCodec })
      } catch {
        resolve(empty)
      }
    })
    proc.on('error', () => {
      clearTimeout(timeout)
      resolve(empty)
    })
  })
}

function handleStream(url: URL, res: import('http').ServerResponse): void {
  const sourceUrl = url.searchParams.get('url')
  const startSeconds = Number(url.searchParams.get('t') ?? '0')
  const audioStreamIndex = url.searchParams.get('audio')
  if (!sourceUrl) {
    res.writeHead(400)
    res.end()
    return
  }

  const ffmpeg = binaryPath('ffmpeg.exe')
  if (!ffmpeg) {
    res.writeHead(500)
    res.end('ffmpeg not found — is Stremio installed?')
    return
  }

  killCurrent()

  const args = [
    // FFmpeg's default input-seek behavior does a fast keyframe seek for every
    // stream, then — for streams being *decoded* (our audio, since we
    // transcode it) — additionally trims forward to the exact requested
    // timestamp. Copied video can't get that same precise trim (it can only
    // start at the keyframe, at or before the target), so audio ends up
    // consistently ahead of video after any seek. -noaccurate_seek disables
    // that extra audio trim so both streams anchor to the same keyframe.
    ...(startSeconds > 0 ? ['-noaccurate_seek', '-ss', String(startSeconds)] : []),
    '-i',
    sourceUrl,
    // Explicit stream mapping only when we know which audio track is English —
    // otherwise let ffmpeg pick its own default (usually stream 0).
    ...(audioStreamIndex ? ['-map', '0:v:0', '-map', `0:${audioStreamIndex}`] : []),
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-ac',
    '2', // downmix to stereo — multichannel AAC over a plain <video> element downmixes
    // unpredictably (missing/quiet dialogue), most setups want stereo out anyway
    '-b:a',
    '192k',
    '-af',
    'aresample=async=1', // corrects small drift between the copied video and re-encoded audio
    '-avoid_negative_ts',
    'make_zero',
    '-max_muxing_queue_size',
    '9999', // copy+transcode pipelines can otherwise overflow the muxer queue and desync
    '-f',
    'mp4',
    '-movflags',
    'frag_keyframe+empty_moov+faststart',
    'pipe:1'
  ]

  const proc = spawn(ffmpeg, args, { windowsHide: true })
  currentProcess = proc

  // CORS header needed because the <video> element now sets crossOrigin
  // (required for the cross-origin <track> subtitles to actually be usable) —
  // that makes the browser fetch video.src itself in CORS mode too, whenever
  // the plain-<video> fallback path (not MSE, which fetches manually) is used.
  res.writeHead(200, { 'Content-Type': 'video/mp4', 'Access-Control-Allow-Origin': '*' })
  proc.stdout.pipe(res)
  proc.stderr.resume() // drain so ffmpeg's verbose logging never blocks the process

  proc.on('error', () => {
    try {
      res.end()
    } catch {
      // response may already be closed
    }
  })

  proc.on('exit', () => {
    if (currentProcess === proc) currentProcess = null
  })
}

async function handleSubtitle(url: URL, res: import('http').ServerResponse): Promise<void> {
  const sourceUrl = url.searchParams.get('url')
  if (!sourceUrl) {
    res.writeHead(400)
    res.end()
    return
  }

  try {
    const vtt = await fetchSubtitleVtt(sourceUrl)
    // <track> resources are fetched cross-origin (renderer origin vs 127.0.0.1)
    // and Chromium silently drops cues from a response with no CORS header —
    // no console error, it just never shows. This was almost certainly why
    // subtitles never rendered.
    res.writeHead(200, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    })
    res.end(vtt)
  } catch {
    res.writeHead(502)
    res.end()
  }
}

/** Starts the local transcode/subtitle proxy. Idempotent — safe to call repeatedly. */
export function startTranscodeProxy(): void {
  if (server) return

  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${TRANSCODE_PROXY_PORT}`)

    if (url.pathname === '/stream') {
      handleStream(url, res)
      const proc = currentProcess
      req.on('close', () => {
        if (currentProcess === proc) killCurrent()
      })
      return
    }

    if (url.pathname === '/subtitle') {
      void handleSubtitle(url, res)
      return
    }

    res.writeHead(404)
    res.end()
  })

  server.listen(TRANSCODE_PROXY_PORT, '127.0.0.1')
}

export function stopTranscodeProxy(): void {
  killCurrent()
  server?.close()
  server = null
}
