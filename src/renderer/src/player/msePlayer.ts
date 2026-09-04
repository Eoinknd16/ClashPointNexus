/**
 * Feeds a live-transcoded fragmented-MP4 stream into a <video> element via
 * MediaSource/SourceBuffer instead of a plain progressive `src`. The point is
 * `sourceBuffer.timestampOffset`: it lets us tell the browser exactly where in
 * the presentation timeline the next appended data starts, regardless of
 * whatever (possibly imprecise, after an ffmpeg -ss keyframe-seek) timestamps
 * are actually baked into the fragments. That sidesteps relying on ffmpeg's
 * seek/timestamp math being exactly right, which repeated attempts at tuning
 * ffmpeg flags never fully nailed down.
 */
export async function startMsePlayback(
  video: HTMLVideoElement,
  streamUrl: string,
  mimeType: string,
  timestampOffsetSeconds: number
): Promise<() => void> {
  const mediaSource = new MediaSource()
  const objectUrl = URL.createObjectURL(mediaSource)
  let stopped = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

  const stop = (): void => {
    if (stopped) return
    stopped = true
    reader?.cancel().catch(() => {})
    try {
      if (mediaSource.readyState === 'open') mediaSource.endOfStream()
    } catch {
      // may already be closed/errored — nothing to do
    }
    URL.revokeObjectURL(objectUrl)
  }

  video.src = objectUrl

  await new Promise<void>((resolve, reject) => {
    mediaSource.addEventListener('sourceopen', () => resolve(), { once: true })
    mediaSource.addEventListener('error', () => reject(new Error('MediaSource error')), { once: true })
  })

  if (stopped) return stop

  const sourceBuffer = mediaSource.addSourceBuffer(mimeType)
  // "sequence" mode ignores each fragment's own baked-in timestamps and just
  // places appended data sequentially starting from timestampOffset — exactly
  // what we want, since we don't need ffmpeg's timestamps to be authoritative.
  sourceBuffer.mode = 'sequence'
  sourceBuffer.timestampOffset = timestampOffsetSeconds

  const appendChunk = (chunk: Uint8Array): Promise<void> =>
    new Promise((resolve, reject) => {
      const onUpdateEnd = (): void => {
        sourceBuffer.removeEventListener('updateend', onUpdateEnd)
        sourceBuffer.removeEventListener('error', onError)
        resolve()
      }
      const onError = (): void => {
        sourceBuffer.removeEventListener('updateend', onUpdateEnd)
        sourceBuffer.removeEventListener('error', onError)
        reject(new Error('SourceBuffer append error'))
      }
      sourceBuffer.addEventListener('updateend', onUpdateEnd, { once: true })
      sourceBuffer.addEventListener('error', onError, { once: true })
      // Fetch's reader type is generic over ArrayBufferLike (permits
      // SharedArrayBuffer) while appendBuffer requires ArrayBuffer — never
      // actually SharedArrayBuffer-backed in practice for a fetch response.
      sourceBuffer.appendBuffer(chunk as BufferSource)
    })

  const response = await fetch(streamUrl)
  if (!response.body) throw new Error('stream response has no body')
  reader = response.body.getReader()

  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done || stopped) break
        if (value && value.byteLength > 0) await appendChunk(value)
      }
    } catch {
      // reader cancelled (stop() called) or append failed mid-stream — either
      // way, nothing further to feed the buffer.
    } finally {
      if (!stopped && mediaSource.readyState === 'open') {
        try {
          mediaSource.endOfStream()
        } catch {
          // ignore — buffer may already be in a state that rejects this
        }
      }
    }
  })()

  return stop
}
