import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CategoryRow } from '../components/CategoryRow'
import type { CardItem } from '../components/FocusableCard'
import { useNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'
import { useNavigationStore } from '../state/navigationStore'
import { subtitleTrackUrl, transcodedStreamUrl } from '@shared/playerConstants'
import { buildMseCodecString } from '../player/codecStrings'
import { startMsePlayback } from '../player/msePlayer'
import type { SubtitleTrack } from '@shared/api'
import type { CatalogItem, CatalogType, StreamOption } from '@shared/stremioTypes'

const FILTERS: CatalogType[] = ['movie', 'series']
type Zone = 'filters' | 'rows' | 'detail' | 'sources' | 'player'

function toCardItem(item: CatalogItem): CardItem {
  return {
    id: item.id,
    title: item.name,
    subtitle: item.year ?? undefined,
    imageUrl: item.poster ?? undefined
  }
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

function formatReleaseDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  } catch {
    return null
  }
}

export function TvScreen(): JSX.Element {
  const [movieCatalog, setMovieCatalog] = useState<CatalogItem[]>([])
  const [seriesCatalog, setSeriesCatalog] = useState<CatalogItem[]>([])
  const [type, setType] = useState<CatalogType>('movie')
  const [zone, setZone] = useState<Zone>('filters')
  const [filterIndex, setFilterIndex] = useState(0)
  const [colIndex, setColIndex] = useState(0)
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null)

  const [streams, setStreams] = useState<StreamOption[]>([])
  const [sourceIndex, setSourceIndex] = useState(0)
  const [sourcesReturnZone, setSourcesReturnZone] = useState<'detail' | 'player'>('detail')
  const [streamIndex, setStreamIndex] = useState(0)
  const [audioIndex, setAudioIndex] = useState<number | undefined>(undefined)
  const [baseOffset, setBaseOffset] = useState(0)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState<number | null>(null)
  const [volume, setVolume] = useState(1)
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([])
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null)
  const [subtitlesOn, setSubtitlesOn] = useState(false)

  const message = useStatusStore((s) => s.message)
  const setMessage = useStatusStore((s) => s.setMessage)
  const goHome = useNavigationStore((s) => s.goHome)
  const sourceRefs = useRef<Array<HTMLDivElement | null>>([])
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const trackRef = useRef<HTMLTrackElement | null>(null)
  const mseStopRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (zone !== 'sources') return
    sourceRefs.current[sourceIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, sourceIndex])

  // <track> elements added after the video already started playing don't always
  // get picked up from the `default` attribute alone — set mode explicitly.
  useEffect(() => {
    const track = trackRef.current?.track
    if (track) track.mode = subtitlesOn ? 'showing' : 'hidden'
  }, [subtitlesOn, subtitleUrl])

  useEffect(() => {
    let cancelled = false
    window.api.stremio
      .getCatalog('movie', 'top')
      .then((items) => {
        if (!cancelled) setMovieCatalog(items)
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(`Failed to load catalog: ${error instanceof Error ? error.message : String(error)}`)
        }
      })
    window.api.stremio
      .getCatalog('series', 'top')
      .then((items) => {
        if (!cancelled) setSeriesCatalog(items)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [setMessage])

  const activeCatalog = type === 'movie' ? movieCatalog : seriesCatalog

  // Catalog listings don't carry a full release date — fetch it once a title is opened.
  useEffect(() => {
    if (!selectedItem || selectedItem.released) return
    let cancelled = false
    window.api.stremio.getReleaseDate(selectedItem.type, selectedItem.id).then((released) => {
      if (cancelled || !released) return
      setSelectedItem((current) =>
        current && current.id === selectedItem.id ? { ...current, released } : current
      )
    })
    return () => {
      cancelled = true
    }
  }, [selectedItem])

  function switchFilter(direction: 1 | -1): void {
    const currentIndex = FILTERS.indexOf(type)
    const next = Math.max(0, Math.min(FILTERS.length - 1, currentIndex + direction))
    setFilterIndex(next)
    setType(FILTERS[next])
    setColIndex(0)
  }

  async function startPlaybackAt(
    sourceUrl: string,
    offsetSeconds: number,
    preferredAudioIndex?: number
  ): Promise<void> {
    setBaseOffset(offsetSeconds)
    setDuration(null)

    const info = await window.api.player.probeMediaInfo(sourceUrl)
    setDuration(info.duration)

    let resolvedAudioIndex = preferredAudioIndex
    if (resolvedAudioIndex === undefined) {
      const isNarration = (title: string | null) => /description|descriptive|commentary/i.test(title ?? '')
      const englishTracks = info.audioTracks.filter((t) => t.language === 'eng')
      // Prefer a "clean" English track — some releases tag an Audio Description
      // (narration-for-accessibility) track as English too, which .find() would
      // otherwise happily grab first if it happened to sort earlier.
      const english = englishTracks.find((t) => !isNarration(t.title)) ?? englishTracks[0]
      resolvedAudioIndex = english && info.audioTracks.length > 1 ? english.index : undefined
      setAudioIndex(resolvedAudioIndex)
    }

    mseStopRef.current?.()
    mseStopRef.current = null

    const video = videoRef.current
    if (!video) return

    const streamUrl = transcodedStreamUrl(sourceUrl, offsetSeconds, resolvedAudioIndex)
    const mimeType = buildMseCodecString(info.videoCodec)
    const canUseMse = mimeType && typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mimeType)

    if (canUseMse) {
      try {
        // eslint-disable-next-line no-console
        console.log('[player] using MSE playback:', mimeType)
        mseStopRef.current = await startMsePlayback(video, streamUrl, mimeType, offsetSeconds)
        video.volume = volume
        void video.play().catch(() => {})
        return
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[player] MSE playback failed, falling back to progressive video', error)
      }
    } else {
      // eslint-disable-next-line no-console
      console.log('[player] MSE not usable for this codec, using progressive playback', info.videoCodec)
    }

    // Fallback: plain progressive <video src> — same as before MSE existed.
    // Explicit reset first since Chromium can carry over stale buffered state
    // from the just-killed previous stream when switching quickly.
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.src = streamUrl
    video.load()
    video.volume = volume
    void video.play().catch(() => {})
  }

  function stopPlayback(): void {
    mseStopRef.current?.()
    mseStopRef.current = null
    videoRef.current?.pause()
    setSubtitleUrl(null)
    setSubtitlesOn(false)
    setSubtitleTracks([])
    setStreams([])
    setDuration(null)
    setAudioIndex(undefined)
  }

  function selectSource(index: number): void {
    const stream = streams[index]
    if (!stream?.playableUrl) return
    setStreamIndex(index)
    setZone('player')
    setMessage(`Playing — ${stream.addonName} (${stream.resolution ?? 'unknown res'})`)
    setAudioIndex(undefined)
    void startPlaybackAt(stream.playableUrl, 0)
  }

  function seek(deltaSeconds: number): void {
    const stream = streams[streamIndex]
    if (!stream?.playableUrl) return
    const current = baseOffset + (videoRef.current?.currentTime ?? 0)
    const target = Math.max(0, duration ? Math.min(duration, current + deltaSeconds) : current + deltaSeconds)
    void startPlaybackAt(stream.playableUrl, target, audioIndex)
  }

  function adjustVolume(delta: number): void {
    setVolume((v) => {
      const next = Math.max(0, Math.min(1, v + delta))
      if (videoRef.current) videoRef.current.volume = next
      return next
    })
  }

  function toggleSubtitles(): void {
    if (subtitlesOn) {
      setSubtitlesOn(false)
      return
    }
    if (subtitleTracks.length === 0) {
      setMessage('No subtitles available for this title')
      return
    }
    if (!subtitleUrl) {
      const preferred = subtitleTracks.find((t) => t.lang === 'eng') ?? subtitleTracks[0]
      setSubtitleUrl(subtitleTrackUrl(preferred.url))
    }
    setSubtitlesOn(true)
  }

  async function resolveStreamsForItem(item: CatalogItem): Promise<void> {
    if (item.type === 'series') {
      setMessage('Series playback needs an episode picker — not built yet')
      return
    }
    setMessage(`Finding streams for ${item.name}...`)
    const result = await window.api.stremio.getStreams(item.type, item.id)
    if (!result.hasAddonsConfigured) {
      setMessage('Add a stream addon in Settings to enable playback')
      return
    }
    const playable = result.streams.filter((s) => s.playableUrl)
    if (playable.length === 0) {
      setMessage(
        result.serverAvailable
          ? 'No playable streams found for this title'
          : "Couldn't start Stremio's streaming server"
      )
      return
    }

    setStreams(playable)
    setSourceIndex(0)
    setSourcesReturnZone('detail')
    setZone('sources')

    window.api.subtitles.getTracks(item.type, item.id).then(setSubtitleTracks)
  }

  useNavListener((action) => {
    if (zone === 'sources') {
      switch (action) {
        case 'up':
          setSourceIndex((i) => Math.max(0, i - 1))
          return
        case 'down':
          setSourceIndex((i) => Math.min(streams.length - 1, i + 1))
          return
        case 'confirm':
          selectSource(sourceIndex)
          return
        case 'back':
        case 'menu':
          setZone(sourcesReturnZone)
          return
        default:
          return
      }
    }

    if (zone === 'player') {
      const video = videoRef.current
      switch (action) {
        case 'confirm':
          if (video) {
            if (video.paused) void video.play()
            else video.pause()
          }
          return
        case 'left':
          seek(-10)
          return
        case 'right':
          seek(10)
          return
        case 'prevStream':
        case 'nextStream':
          setSourceIndex(streamIndex)
          setSourcesReturnZone('player')
          setZone('sources')
          return
        case 'volumeDown':
          adjustVolume(-0.1)
          return
        case 'volumeUp':
          adjustVolume(0.1)
          return
        case 'toggleSubtitles':
          toggleSubtitles()
          return
        case 'back':
        case 'menu':
          stopPlayback()
          setZone('detail')
          return
        default:
          return
      }
    }

    if (zone === 'detail') {
      switch (action) {
        case 'confirm':
          if (selectedItem) void resolveStreamsForItem(selectedItem)
          return
        case 'back':
        case 'menu':
          setSelectedItem(null)
          setZone('rows')
          return
        default:
          return
      }
    }

    if (zone === 'filters') {
      switch (action) {
        case 'left':
          setFilterIndex((i) => Math.max(0, i - 1))
          return
        case 'right':
          setFilterIndex((i) => Math.min(FILTERS.length - 1, i + 1))
          return
        case 'down':
          setZone('rows')
          setColIndex(0)
          return
        case 'confirm':
          setType(FILTERS[filterIndex])
          setColIndex(0)
          return
        case 'prevStream':
          switchFilter(-1)
          return
        case 'nextStream':
          switchFilter(1)
          return
        case 'back':
        case 'menu':
          goHome()
          return
        default:
          return
      }
    }

    // zone === 'rows'
    switch (action) {
      case 'up':
        setZone('filters')
        return
      case 'left':
        setColIndex((c) => Math.max(0, c - 1))
        return
      case 'right':
        setColIndex((c) => Math.min(Math.max(0, activeCatalog.length - 1), c + 1))
        return
      case 'prevStream':
        switchFilter(-1)
        return
      case 'nextStream':
        switchFilter(1)
        return
      case 'confirm': {
        const item = activeCatalog[colIndex]
        if (!item) return
        setSelectedItem(item)
        setZone('detail')
        return
      }
      case 'back':
      case 'menu':
        goHome()
        return
      default:
        return
    }
  })

  const sourcesOverlay = zone === 'sources' && (
    <div className="absolute inset-x-0 bottom-0 z-20 flex h-[45%] flex-col gap-3 overflow-hidden bg-surface/95 p-6 backdrop-blur">
      <h3 className="text-lg font-semibold">Choose a source ({streams.length})</h3>
      <div className="flex flex-col gap-2 overflow-y-auto">
        {streams.map((s, i) => (
          <div
            key={i}
            ref={(el) => (sourceRefs.current[i] = el)}
            onClick={() => selectSource(i)}
            className={`flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3 ${
              sourceIndex === i ? 'bg-accent text-white' : 'bg-surface-hi'
            }`}
          >
            <span className="shrink-0 rounded bg-black/30 px-2 py-1 text-xs font-semibold">
              {s.resolution ?? '?'}
            </span>
            <span className="shrink-0 rounded bg-black/30 px-2 py-1 text-xs">{s.addonName}</span>
            {s.languages.length > 0 && (
              <span className="shrink-0 text-xs opacity-80">{s.languages.join(', ')}</span>
            )}
            <span className="flex-1 truncate text-sm">{s.title}</span>
          </div>
        ))}
      </div>
    </div>
  )

  if (zone === 'player' || (zone === 'sources' && sourcesReturnZone === 'player')) {
    const progressPct = duration ? Math.min(100, (position / duration) * 100) : 0
    return (
      <div className="relative flex h-screen items-center justify-center bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          autoPlay
          crossOrigin="anonymous"
          className="h-full w-full"
          onClick={() => {
            const video = videoRef.current
            if (!video) return
            if (video.paused) void video.play()
            else video.pause()
          }}
          onTimeUpdate={(event) => setPosition(baseOffset + event.currentTarget.currentTime)}
        >
          {subtitleUrl && (
            <track ref={trackRef} kind="subtitles" src={subtitleUrl} default label="Subtitles" />
          )}
        </video>

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/90 to-transparent p-8">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>{selectedItem?.name}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/20">
            <div className="h-full rounded-full bg-accent" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {formatTime(position)} / {duration ? formatTime(duration) : '--:--'}
            </span>
            <div className="flex items-center gap-4">
              <span>Vol {Math.round(volume * 100)}%</span>
              <span>{subtitlesOn ? 'CC On' : 'CC Off'}</span>
            </div>
          </div>
        </div>

        {sourcesOverlay}
      </div>
    )
  }

  const selectedCard = selectedItem ? toCardItem(selectedItem) : null
  const releaseDate = selectedItem ? formatReleaseDate(selectedItem.released) : null

  return (
    <div className="relative flex h-screen bg-bg">
      <motion.div layout className="flex flex-1 flex-col gap-6 overflow-hidden px-10 py-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">TV</h1>
        </header>

        <div className="flex gap-3">
          {FILTERS.map((f, i) => (
            <div
              key={f}
              onClick={() => {
                setZone('filters')
                setFilterIndex(i)
                setType(f)
                setColIndex(0)
              }}
              className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                type === f ? 'bg-accent text-white' : 'bg-surface text-muted'
              } ${zone === 'filters' && filterIndex === i ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}
            >
              {f === 'movie' ? 'Movies' : 'Series'}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          <CategoryRow
            label={type === 'movie' ? 'Popular Movies' : 'Popular Series'}
            items={activeCatalog.map(toCardItem)}
            focused={zone === 'rows'}
            focusedIndex={colIndex}
            aspect="portrait"
            onSelect={(index) => {
              setZone('rows')
              setColIndex(index)
              setSelectedItem(activeCatalog[index])
              setZone('detail')
            }}
          />
        </div>

        <footer className="text-sm text-muted">{message}</footer>
      </motion.div>

      <AnimatePresence mode="popLayout">
        {selectedItem && selectedCard && (
          <motion.div
            key="detail"
            layout
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="shadow-panel flex w-[420px] shrink-0 flex-col gap-4 overflow-y-auto bg-surface p-8"
          >
            <div className="aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface-hi">
              {selectedCard.imageUrl && (
                <img src={selectedCard.imageUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>

            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-bold leading-tight">{selectedItem.name}</h2>
              <p className="text-muted">{releaseDate ?? selectedItem.year ?? ''}</p>
              {selectedItem.genres.length > 0 && (
                <p className="text-sm text-muted">{selectedItem.genres.join(' · ')}</p>
              )}
              {selectedItem.description && (
                <p className="mt-2 line-clamp-6 text-sm text-muted">{selectedItem.description}</p>
              )}
            </div>

            <button
              onClick={() => void resolveStreamsForItem(selectedItem)}
              className="mt-auto rounded-xl bg-accent-gradient px-6 py-4 text-lg font-semibold text-white shadow-focus"
            >
              ▶ Play
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {sourcesOverlay}
    </div>
  )
}
