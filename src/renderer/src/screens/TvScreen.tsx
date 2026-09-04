import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CategoryRow } from '../components/CategoryRow'
import type { CardItem } from '../components/FocusableCard'
import { FocusableCard } from '../components/FocusableCard'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { KEY_ROWS, applyKey, clampKeyboardFocus } from '../components/onScreenKeyboardLayout'
import { useNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'
import { useNavigationStore } from '../state/navigationStore'
import { subtitleTrackUrl, transcodedStreamUrl } from '@shared/playerConstants'
import { buildMseCodecString } from '../player/codecStrings'
import { startMsePlayback } from '../player/msePlayer'
import type { SubtitleTrack } from '@shared/api'
import type { LibraryEntry } from '@shared/libraryTypes'
import type { WatchProgress } from '@shared/progressTypes'
import { seasonSortKey } from '@shared/stremioTypes'
import type { AddonCatalogRow, CatalogItem, CatalogType, EpisodeItem, StreamOption } from '@shared/stremioTypes'

type BrowseTab = 'movie' | 'series' | 'library'
type Zone = 'filters' | 'rows' | 'detail' | 'episodes' | 'expanded' | 'sources' | 'player' | 'keyboard'
type EpisodeSubZone = 'seasons' | 'list'

const TABS: BrowseTab[] = ['movie', 'series', 'library']
const EXPANDED_COLUMNS = 6
const EXPANDED_SKIP_CAP = 950
// A row only ever shows a handful of cards on screen at once — rendering a
// full ~50-item catalog page into the DOM for every one of the ~25 rows on a
// tab adds up fast. "See All" still paginates the true underlying catalog;
// this only caps what the inline row itself mounts.
const ROW_PREVIEW_CAP = 20
const CURRENT_YEAR = String(new Date().getFullYear())

// Straight from Cinemeta's own manifest.json (its "top" catalog's declared
// genre list) — matching the real Stremio app's board, which shows one row
// per genre off the same Popular catalog. Series adds three TV-only genres.
const MOVIE_GENRES = [
  'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Mystery', 'Romance', 'Sci-Fi',
  'Sport', 'Thriller', 'War', 'Western'
]
const SERIES_GENRES = [...MOVIE_GENRES, 'Reality-TV', 'Talk-Show', 'Game-Show']

interface RowSource {
  catalogId: 'top' | 'year' | 'imdbRating'
  genre?: string
}

interface RowDef {
  key: string
  label: string
  items: CatalogItem[]
  /** Cinemeta catalog + genre for further pagination in the expanded grid —
   * null for locally-sourced rows (Continue Watching, My Library, addon rows)
   * that don't paginate. */
  source: RowSource | null
}

type ActivePlayback =
  | { kind: 'movie'; id: string }
  | {
      kind: 'series'
      seriesId: string
      seriesTitle: string
      season: number
      episode: number
      episodeId: string
    }

function tabLabel(tab: BrowseTab): string {
  if (tab === 'movie') return 'Movies'
  if (tab === 'series') return 'Series'
  return 'My Library'
}

function toCardItem(item: CatalogItem): CardItem {
  return {
    id: item.id,
    title: item.name,
    subtitle: item.year ?? undefined,
    imageUrl: item.poster ?? undefined
  }
}

function libraryEntryToCatalogItem(entry: LibraryEntry): CatalogItem {
  return {
    id: entry.id,
    type: entry.type,
    name: entry.name,
    poster: entry.poster,
    description: null,
    year: null,
    released: null,
    genres: []
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

/** Resumable = meaningfully into it, and not already essentially finished. */
function isResumable(progress: WatchProgress | null | undefined): progress is WatchProgress {
  return (
    !!progress &&
    progress.positionSeconds > 5 &&
    (!progress.durationSeconds || progress.positionSeconds < progress.durationSeconds * 0.95)
  )
}

function sortEpisodes(episodes: EpisodeItem[]): EpisodeItem[] {
  return [...episodes].sort(
    (a, b) => seasonSortKey(a.season) - seasonSortKey(b.season) || a.episode - b.episode
  )
}

export function TvScreen(): JSX.Element {
  const [movieCatalog, setMovieCatalog] = useState<CatalogItem[]>([])
  const [seriesCatalog, setSeriesCatalog] = useState<CatalogItem[]>([])
  const [newMovies, setNewMovies] = useState<CatalogItem[]>([])
  const [newSeries, setNewSeries] = useState<CatalogItem[]>([])
  const [featuredMovies, setFeaturedMovies] = useState<CatalogItem[]>([])
  const [featuredSeries, setFeaturedSeries] = useState<CatalogItem[]>([])
  // Keyed by "movie:Action" etc. — populated progressively per genre, only for
  // whichever tab is/has been active, so switching tabs doesn't refetch.
  const [genreRows, setGenreRows] = useState<Record<string, CatalogItem[]>>({})
  const requestedGenresRef = useRef<Set<string>>(new Set())
  const [continueWatching, setContinueWatching] = useState<CatalogItem[]>([])
  // Keyed by tab, same caching approach as genreRows — avoids both a refetch
  // and a flash of the previous tab's addon rows every time you switch tabs.
  const [addonRowsByTab, setAddonRowsByTab] = useState<Partial<Record<BrowseTab, AddonCatalogRow[]>>>({})
  const requestedAddonTabsRef = useRef<Set<BrowseTab>>(new Set())
  const [libraryItems, setLibraryItems] = useState<LibraryEntry[]>([])
  const [isSelectedInLibrary, setIsSelectedInLibrary] = useState(false)

  const [tab, setTab] = useState<BrowseTab>('movie')
  const [zone, setZone] = useState<Zone>('filters')
  const [tabIndex, setTabIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [kbRow, setKbRow] = useState(0)
  const [kbCol, setKbCol] = useState(0)
  const [kbValue, setKbValue] = useState('')
  const [kbShift, setKbShift] = useState(false)
  const [rowIndex, setRowIndex] = useState(0)
  const [colIndex, setColIndex] = useState(0)
  const [detailReturnZone, setDetailReturnZone] = useState<'rows' | 'expanded'>('rows')
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null)
  const [detailFocusIndex, setDetailFocusIndex] = useState(0)
  const [progress, setProgress] = useState<WatchProgress | null | undefined>(undefined)
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([])
  const [episodeSubZone, setEpisodeSubZone] = useState<EpisodeSubZone>('seasons')
  const [seasonIndex, setSeasonIndex] = useState(0)
  const [episodeIndex, setEpisodeIndex] = useState(0)
  const [activePlayback, setActivePlayback] = useState<ActivePlayback | null>(null)
  const [resumeOffset, setResumeOffset] = useState(0)

  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<CatalogItem[]>([])
  const [expandedIndex, setExpandedIndex] = useState(0)
  const [expandedSkip, setExpandedSkip] = useState(0)
  const [expandedHasMore, setExpandedHasMore] = useState(false)
  const [expandedLoading, setExpandedLoading] = useState(false)

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
  const [controlsVisible, setControlsVisible] = useState(true)
  const [isPaused, setIsPaused] = useState(false)

  const message = useStatusStore((s) => s.message)
  const setMessage = useStatusStore((s) => s.setMessage)
  const goHome = useNavigationStore((s) => s.goHome)
  const sourceRefs = useRef<Array<HTMLDivElement | null>>([])
  const episodeRefs = useRef<Array<HTMLDivElement | null>>([])
  const expandedRefs = useRef<Array<HTMLDivElement | null>>([])
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const trackRef = useRef<HTMLTrackElement | null>(null)
  const mseStopRef = useRef<(() => void) | null>(null)
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastProgressSaveRef = useRef(0)
  // Synchronous lock for loadMoreExpanded — expandedLoading (React state) can
  // still read stale across two nav presses that land in the same tick, since
  // its update isn't applied until the next render; a ref updates immediately.
  const loadingMoreRef = useRef(false)

  const rows: RowDef[] = (() => {
    if (tab === 'library') {
      return [
        {
          key: 'library',
          label: 'My Library',
          items: libraryItems.map(libraryEntryToCatalogItem),
          source: null
        }
      ]
    }
    // Addon-provided catalogs don't paginate further in the expanded grid (most
    // addons only ever have the one page they already returned) — source null
    // marks that the same way Continue Watching/My Library already do.
    const addonRowDefs: RowDef[] = (addonRowsByTab[tab] ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      items: r.items,
      source: null
    }))

    const genres = tab === 'movie' ? MOVIE_GENRES : SERIES_GENRES
    const genreRowDefs: RowDef[] = genres
      .map((genre): RowDef | null => {
        const items = genreRows[`${tab}:${genre}`]
        if (!items || items.length === 0) return null
        return { key: `genre:${tab}:${genre}`, label: genre, items, source: { catalogId: 'top', genre } }
      })
      .filter((r): r is RowDef => r !== null)

    if (tab === 'movie') {
      return [
        { key: 'popular-movie', label: 'Popular Movies', items: movieCatalog, source: { catalogId: 'top' } },
        {
          key: 'new-movie',
          label: 'New Movies',
          items: newMovies,
          source: { catalogId: 'year', genre: CURRENT_YEAR }
        },
        {
          key: 'featured-movie',
          label: 'Featured Movies',
          items: featuredMovies,
          source: { catalogId: 'imdbRating' }
        },
        ...genreRowDefs,
        ...addonRowDefs
      ]
    }
    const seriesRows: RowDef[] = []
    if (continueWatching.length > 0) {
      seriesRows.push({ key: 'continue', label: 'Continue Watching', items: continueWatching, source: null })
    }
    seriesRows.push(
      { key: 'popular-series', label: 'Popular Series', items: seriesCatalog, source: { catalogId: 'top' } },
      {
        key: 'new-series',
        label: 'New Series',
        items: newSeries,
        source: { catalogId: 'year', genre: CURRENT_YEAR }
      },
      {
        key: 'featured-series',
        label: 'Featured Series',
        items: featuredSeries,
        source: { catalogId: 'imdbRating' }
      },
      ...genreRowDefs,
      ...addonRowDefs
    )
    return seriesRows
  })()

  const inEpisodesView = zone === 'episodes'
  const inPlayerView = zone === 'player' || (zone === 'sources' && sourcesReturnZone === 'player')

  useEffect(() => {
    if (zone !== 'sources') return
    sourceRefs.current[sourceIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, sourceIndex])

  useEffect(() => {
    if (zone !== 'episodes' || episodeSubZone !== 'list') return
    episodeRefs.current[episodeIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, episodeSubZone, episodeIndex])

  useEffect(() => {
    if (zone !== 'expanded') return
    expandedRefs.current[expandedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, expandedIndex])

  useEffect(() => {
    if (zone !== 'rows') return
    rowRefs.current[rowIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, rowIndex])

  // Any activity (nav input, mouse move, pausing) shows the control bar and
  // resets the auto-hide clock; it only counts down while actually playing.
  const wakeControls = useCallback((autoHide: boolean) => {
    setControlsVisible(true)
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current)
    hideControlsTimerRef.current = autoHide ? setTimeout(() => setControlsVisible(false), 3500) : null
  }, [])

  useEffect(() => {
    if (!inPlayerView) return
    wakeControls(!isPaused)
    return () => {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPlayerView])

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
    // "New" isn't its own catalog id in Cinemeta's current manifest — it's the
    // "year" catalog (genre is required there) filtered to the current year.
    window.api.stremio
      .getCatalog('movie', 'year', 0, CURRENT_YEAR)
      .then((items) => {
        if (!cancelled) setNewMovies(items)
      })
      .catch(() => {})
    window.api.stremio
      .getCatalog('series', 'year', 0, CURRENT_YEAR)
      .then((items) => {
        if (!cancelled) setNewSeries(items)
      })
      .catch(() => {})
    window.api.stremio
      .getCatalog('movie', 'imdbRating')
      .then((items) => {
        if (!cancelled) setFeaturedMovies(items)
      })
      .catch(() => {})
    window.api.stremio
      .getCatalog('series', 'imdbRating')
      .then((items) => {
        if (!cancelled) setFeaturedSeries(items)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [setMessage])

  // One row per genre, same as the real Stremio board — fetched lazily per tab
  // (not all ~20 up front for both types) and only once each, ever, per session.
  useEffect(() => {
    if (tab !== 'movie' && tab !== 'series') return
    const genres = tab === 'movie' ? MOVIE_GENRES : SERIES_GENRES
    let cancelled = false
    for (const genre of genres) {
      const key = `${tab}:${genre}`
      if (requestedGenresRef.current.has(key)) continue
      requestedGenresRef.current.add(key)
      window.api.stremio
        .getCatalog(tab, 'top', 0, genre)
        .then((items) => {
          if (cancelled || items.length === 0) return
          setGenreRows((prev) => ({ ...prev, [key]: items }))
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [tab])

  // Refreshed every time we're back at browse level — picks up anything that
  // just changed (an episode finished, a title was added/removed from the library).
  useEffect(() => {
    if (zone !== 'filters' && zone !== 'rows') return
    window.api.library.list().then(setLibraryItems)
    window.api.stremio.getContinueWatching('series').then(setContinueWatching)
  }, [zone])

  // Pulls a row per movie/series catalog declared by the user's own configured
  // Stremio addons — not just Cinemeta's Popular/New defaults. Fetched once per
  // tab, ever, per session — same caching approach as the genre rows below.
  useEffect(() => {
    if (tab !== 'movie' && tab !== 'series') return
    if (requestedAddonTabsRef.current.has(tab)) return
    requestedAddonTabsRef.current.add(tab)
    let cancelled = false
    window.api.stremio.getAddonCatalogs(tab).then((rows) => {
      if (!cancelled) setAddonRowsByTab((prev) => ({ ...prev, [tab]: rows }))
    })
    return () => {
      cancelled = true
    }
  }, [tab])

  useEffect(() => {
    if (!selectedItem) {
      setIsSelectedInLibrary(false)
      return
    }
    let cancelled = false
    window.api.library.has(selectedItem.type, selectedItem.id).then((has) => {
      if (!cancelled) setIsSelectedInLibrary(has)
    })
    return () => {
      cancelled = true
    }
  }, [selectedItem])

  // Fresh detail panel always starts focused on Play, not whatever button was
  // last focused on a previously-viewed title.
  useEffect(() => {
    setDetailFocusIndex(0)
  }, [selectedItem?.id])

  // Opening a title fetches its saved watch progress plus, for a series, its
  // full episode list — one combined effect so there's no race between the
  // two requests when picking the initial season/episode to focus.
  useEffect(() => {
    if (!selectedItem) {
      setProgress(null)
      setEpisodes([])
      setSeasonIndex(0)
      setEpisodeIndex(0)
      return
    }

    let cancelled = false
    setProgress(undefined)
    setEpisodes([])

    async function load(item: CatalogItem): Promise<void> {
      const progressPromise = window.api.progress.get(item.type, item.id)

      if (item.type === 'series') {
        const [savedProgress, meta] = await Promise.all([
          progressPromise,
          window.api.stremio.getSeriesMeta(item.id)
        ])
        if (cancelled) return
        setProgress(savedProgress)
        setEpisodes(meta.episodes)
        if (meta.released && !item.released) {
          setSelectedItem((current) =>
            current && current.id === item.id ? { ...current, released: meta.released } : current
          )
        }

        const seasons = Array.from(new Set(meta.episodes.map((e) => e.season))).sort(
          (a, b) => seasonSortKey(a) - seasonSortKey(b)
        )
        let sIdx = 0
        let eIdx = 0
        if (savedProgress?.season != null && savedProgress.episode != null) {
          const foundSeason = seasons.indexOf(savedProgress.season)
          if (foundSeason >= 0) {
            sIdx = foundSeason
            const epsForSeason = meta.episodes.filter((e) => e.season === savedProgress.season)
            const foundEpisode = epsForSeason.findIndex((e) => e.episode === savedProgress.episode)
            if (foundEpisode >= 0) eIdx = foundEpisode
          }
        }
        setSeasonIndex(sIdx)
        setEpisodeIndex(eIdx)
        return
      }

      const savedProgress = await progressPromise
      if (cancelled) return
      setProgress(savedProgress)

      if (!item.released) {
        const released = await window.api.stremio.getReleaseDate(item.type, item.id)
        if (!cancelled && released) {
          setSelectedItem((current) =>
            current && current.id === item.id ? { ...current, released } : current
          )
        }
      }
    }

    void load(selectedItem)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem?.id])

  const seasonsList = Array.from(new Set(episodes.map((e) => e.season))).sort(
    (a, b) => seasonSortKey(a) - seasonSortKey(b)
  )
  const activeSeason = seasonsList[seasonIndex] ?? 0
  const episodesForSeason = episodes.filter((e) => e.season === activeSeason)

  function switchTab(direction: 1 | -1): void {
    const next = Math.max(0, Math.min(TABS.length - 1, tabIndex + direction))
    setTabIndex(next)
    setTab(TABS[next])
    setRowIndex(0)
    setColIndex(0)
  }

  function switchSeason(direction: 1 | -1): void {
    const next = Math.max(0, Math.min(seasonsList.length - 1, seasonIndex + direction))
    setSeasonIndex(next)
    setEpisodeIndex(0)
  }

  function findNextEpisode(season: number, episode: number): EpisodeItem | null {
    const sorted = sortEpisodes(episodes)
    const idx = sorted.findIndex((e) => e.season === season && e.episode === episode)
    if (idx === -1) return null
    return sorted[idx + 1] ?? null
  }

  function toggleLibrary(): void {
    if (!selectedItem) return
    if (isSelectedInLibrary) {
      void window.api.library.remove(selectedItem.type, selectedItem.id)
      setIsSelectedInLibrary(false)
    } else {
      void window.api.library.add({
        type: selectedItem.type,
        id: selectedItem.id,
        name: selectedItem.name,
        poster: selectedItem.poster
      })
      setIsSelectedInLibrary(true)
    }
  }

  function openExpanded(row: RowDef): void {
    setExpandedRowKey(row.key)
    setExpandedItems(row.items)
    setExpandedIndex(0)
    setExpandedSkip(row.items.length)
    setExpandedHasMore(row.source !== null)
    setZone('expanded')
  }

  // Search reuses the same expanded-grid view as "See All" — result sets are
  // small enough (Cinemeta's search isn't paginated) that expandedHasMore just
  // stays false, and "search" isn't a real key in `rows` so loadMoreExpanded's
  // row lookup naturally no-ops for it.
  function showSearchResults(items: CatalogItem[]): void {
    setExpandedRowKey('search')
    setExpandedItems(items)
    setExpandedIndex(0)
    setExpandedSkip(items.length)
    setExpandedHasMore(false)
    setZone('expanded')
  }

  function openKeyboard(initialValue: string): void {
    setKbValue(initialValue)
    setKbShift(false)
    setKbRow(0)
    setKbCol(0)
    setZone('keyboard')
  }

  async function submitSearch(query: string): Promise<void> {
    const trimmed = query.trim()
    setSearchQuery(trimmed)
    if (!trimmed) {
      setZone('filters')
      return
    }

    if (tab === 'library') {
      const results = libraryItems
        .filter((e) => e.name.toLowerCase().includes(trimmed.toLowerCase()))
        .map(libraryEntryToCatalogItem)
      showSearchResults(results)
      return
    }

    setZone('filters')
    setMessage(`Searching for "${trimmed}"...`)
    try {
      const results = await window.api.stremio.search(tab, trimmed)
      showSearchResults(results)
      setMessage(results.length > 0 ? 'Ready' : `No results for "${trimmed}"`)
    } catch (error) {
      setMessage(`Search failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function submitKeyboard(finalValue: string): void {
    void submitSearch(finalValue)
  }

  function cancelKeyboard(): void {
    setZone('filters')
  }

  function pressVirtualKey(key: string): void {
    const result = applyKey(key, kbValue, kbShift)
    setKbValue(result.value)
    setKbShift(result.shift)
    if (result.done) submitKeyboard(result.value)
  }

  async function loadMoreExpanded(): Promise<void> {
    const row = rows.find((r) => r.key === expandedRowKey)
    if (!row?.source || loadingMoreRef.current || !expandedHasMore || expandedSkip > EXPANDED_SKIP_CAP) {
      setExpandedHasMore(false)
      return
    }
    loadingMoreRef.current = true
    setExpandedLoading(true)
    const catalogType: CatalogType = tab === 'series' ? 'series' : 'movie'
    try {
      const next = await window.api.stremio.getCatalog(
        catalogType,
        row.source.catalogId,
        expandedSkip,
        row.source.genre
      )
      if (next.length === 0) {
        setExpandedHasMore(false)
      } else {
        setExpandedItems((prev) => [...prev, ...next])
        setExpandedSkip((s) => s + next.length)
      }
    } finally {
      loadingMoreRef.current = false
      setExpandedLoading(false)
    }
  }

  function persistProgress(finalize: boolean): void {
    if (!activePlayback) return
    const pos = baseOffset + (videoRef.current?.currentTime ?? 0)
    const finished = duration != null && pos >= duration * 0.95

    if (activePlayback.kind === 'movie') {
      if (finished && finalize) {
        void window.api.progress.clear('movie', activePlayback.id)
        return
      }
      void window.api.progress.save({
        type: 'movie',
        id: activePlayback.id,
        positionSeconds: pos,
        durationSeconds: duration,
        updatedAt: Date.now()
      })
      return
    }

    void window.api.progress.save({
      type: 'series',
      id: activePlayback.seriesId,
      positionSeconds: pos,
      durationSeconds: duration,
      season: activePlayback.season,
      episode: activePlayback.episode,
      episodeId: activePlayback.episodeId,
      updatedAt: Date.now()
    })
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
    persistProgress(false)
    mseStopRef.current?.()
    mseStopRef.current = null
    videoRef.current?.pause()
    setSubtitleUrl(null)
    setSubtitlesOn(false)
    setSubtitleTracks([])
    setStreams([])
    setDuration(null)
    setAudioIndex(undefined)
    setActivePlayback(null)
  }

  function selectSource(index: number): void {
    const stream = streams[index]
    if (!stream?.playableUrl) return
    setStreamIndex(index)
    setZone('player')
    setMessage(`Playing — ${stream.addonName} (${stream.resolution ?? 'unknown res'})`)
    setAudioIndex(undefined)
    void startPlaybackAt(stream.playableUrl, resumeOffset, undefined)
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

  async function playMovie(item: CatalogItem, opts?: { auto?: boolean }): Promise<void> {
    setMessage(`Finding streams for ${item.name}...`)
    const result = await window.api.stremio.getStreams('movie', item.id)
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
    setActivePlayback({ kind: 'movie', id: item.id })
    const offset = progress?.type === 'movie' && isResumable(progress) ? progress.positionSeconds : 0
    setResumeOffset(offset)
    window.api.subtitles.getTracks('movie', item.id).then(setSubtitleTracks)

    // Play = auto-play the top-ranked stream; the Source button (auto:false)
    // is the only path that still stops at the manual picker.
    const first = playable[0]
    if (opts?.auto && first?.playableUrl) {
      setStreamIndex(0)
      setZone('player')
      setMessage(`Playing — ${first.addonName} (${first.resolution ?? 'unknown res'})`)
      setAudioIndex(undefined)
      void startPlaybackAt(first.playableUrl, offset, undefined)
    } else {
      setZone('sources')
    }
  }

  async function playEpisode(ep: EpisodeItem): Promise<void> {
    if (!selectedItem) return
    setMessage(`Finding streams for ${selectedItem.name} S${ep.season}E${ep.episode}...`)
    const result = await window.api.stremio.getStreams('series', ep.id)
    if (!result.hasAddonsConfigured) {
      setMessage('Add a stream addon in Settings to enable playback')
      return
    }
    const playable = result.streams.filter((s) => s.playableUrl)
    const first = playable[0]
    if (!first?.playableUrl) {
      setMessage(
        result.serverAvailable
          ? 'No playable streams found for this episode'
          : "Couldn't start Stremio's streaming server"
      )
      return
    }

    setStreams(playable)
    setSourceIndex(0)
    setActivePlayback({
      kind: 'series',
      seriesId: selectedItem.id,
      seriesTitle: selectedItem.name,
      season: ep.season,
      episode: ep.episode,
      episodeId: ep.id
    })
    const sameEpisode =
      progress?.type === 'series' && progress.season === ep.season && progress.episode === ep.episode
    const offset = sameEpisode && isResumable(progress) ? progress.positionSeconds : 0
    setResumeOffset(offset)
    window.api.subtitles.getTracks('series', ep.id).then(setSubtitleTracks)

    // Episodes always auto-play the top stream — bingeing shouldn't stop to ask
    // which mirror to use. A bad stream can still be swapped mid-playback via
    // the bumper-reselect shortcut in the player zone.
    setStreamIndex(0)
    setZone('player')
    setMessage(`Playing — ${first.addonName} (${first.resolution ?? 'unknown res'})`)
    setAudioIndex(undefined)
    void startPlaybackAt(first.playableUrl, offset, undefined)
  }

  function playSeriesFromDetail(): void {
    if (!selectedItem) return
    if (episodes.length === 0) {
      setEpisodeSubZone('seasons')
      setZone('episodes')
      return
    }
    if (isResumable(progress) && progress.season != null && progress.episode != null) {
      const ep = episodes.find((e) => e.season === progress.season && e.episode === progress.episode)
      if (ep) {
        void playEpisode(ep)
        return
      }
    }
    const first = sortEpisodes(episodes)[0]
    if (first) void playEpisode(first)
  }

  useNavListener((action) => {
    if (zone === 'keyboard') {
      switch (action) {
        case 'up': {
          const next = clampKeyboardFocus(kbRow - 1, kbCol)
          setKbRow(next.row)
          setKbCol(next.col)
          return
        }
        case 'down': {
          const next = clampKeyboardFocus(kbRow + 1, kbCol)
          setKbRow(next.row)
          setKbCol(next.col)
          return
        }
        case 'left':
          setKbCol((c) => Math.max(0, c - 1))
          return
        case 'right':
          setKbCol((c) => clampKeyboardFocus(kbRow, c + 1).col)
          return
        case 'confirm':
          pressVirtualKey(KEY_ROWS[kbRow][kbCol])
          return
        case 'back':
        case 'menu':
          cancelKeyboard()
          return
        default:
          return
      }
    }

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
      if (action !== 'back' && action !== 'menu') wakeControls(!isPaused)
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
          // Carry the current position forward — reselecting a source mid-playback
          // should pick up where you were, not restart the episode/movie from zero.
          setResumeOffset(baseOffset + (videoRef.current?.currentTime ?? 0))
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
        case 'menu': {
          const wasSeries = activePlayback?.kind === 'series'
          stopPlayback()
          setZone(wasSeries ? 'episodes' : 'detail')
          return
        }
        default:
          return
      }
    }

    if (zone === 'episodes') {
      if (episodeSubZone === 'seasons') {
        switch (action) {
          case 'left':
            setSeasonIndex((i) => Math.max(0, i - 1))
            return
          case 'right':
            setSeasonIndex((i) => Math.min(seasonsList.length - 1, i + 1))
            return
          case 'down':
            setEpisodeSubZone('list')
            setEpisodeIndex(0)
            return
          case 'prevStream':
            switchSeason(-1)
            return
          case 'nextStream':
            switchSeason(1)
            return
          case 'back':
          case 'menu':
            setZone('detail')
            return
          default:
            return
        }
      }

      // episodeSubZone === 'list'
      switch (action) {
        case 'up':
          if (episodeIndex === 0) setEpisodeSubZone('seasons')
          else setEpisodeIndex((i) => i - 1)
          return
        case 'down':
          setEpisodeIndex((i) => Math.min(episodesForSeason.length - 1, i + 1))
          return
        case 'confirm': {
          const ep = episodesForSeason[episodeIndex]
          if (ep) void playEpisode(ep)
          return
        }
        case 'prevStream':
          switchSeason(-1)
          return
        case 'nextStream':
          switchSeason(1)
          return
        case 'back':
        case 'menu':
          setZone('detail')
          return
        default:
          return
      }
    }

    if (zone === 'expanded') {
      switch (action) {
        case 'up':
          setExpandedIndex((i) => Math.max(0, i - EXPANDED_COLUMNS))
          return
        case 'down':
          setExpandedIndex((i) => {
            const next = i + EXPANDED_COLUMNS < expandedItems.length ? i + EXPANDED_COLUMNS : i
            if (next >= expandedItems.length - EXPANDED_COLUMNS * 2) void loadMoreExpanded()
            return next
          })
          return
        case 'left':
          setExpandedIndex((i) => (i % EXPANDED_COLUMNS === 0 ? i : i - 1))
          return
        case 'right':
          setExpandedIndex((i) => {
            if (i % EXPANDED_COLUMNS === EXPANDED_COLUMNS - 1 || i === expandedItems.length - 1) return i
            const next = i + 1
            if (next >= expandedItems.length - EXPANDED_COLUMNS * 2) void loadMoreExpanded()
            return next
          })
          return
        case 'confirm': {
          const item = expandedItems[expandedIndex]
          if (!item) return
          setDetailReturnZone('expanded')
          setSelectedItem(item)
          setZone('detail')
          return
        }
        case 'back':
        case 'menu':
          setZone('rows')
          return
        default:
          return
      }
    }

    if (zone === 'detail') {
      // Three focusable controls — 0: Play, 1: Source/Episodes, 2: Library —
      // navigated with the d-pad/stick and Confirm like everything else in the
      // app. The bumpers/Square shortcuts below still work too, but some
      // controllers (seemingly more common over Bluetooth) report those at
      // different button indices, so d-pad+Confirm is the one path guaranteed
      // to reach all three regardless of controller quirks.
      function activateDetailFocus(index: number): void {
        if (!selectedItem) return
        if (index === 0) {
          if (selectedItem.type === 'series') playSeriesFromDetail()
          else void playMovie(selectedItem, { auto: true })
        } else if (index === 1) {
          if (selectedItem.type === 'series') {
            setEpisodeSubZone('seasons')
            setZone('episodes')
          } else {
            void playMovie(selectedItem, { auto: false })
          }
        } else {
          toggleLibrary()
        }
      }

      switch (action) {
        case 'up':
          setDetailFocusIndex((i) => Math.max(0, i - 1))
          return
        case 'down':
          setDetailFocusIndex((i) => Math.min(2, i + 1))
          return
        case 'left':
          setDetailFocusIndex((i) => (i === 2 ? 1 : i))
          return
        case 'right':
          setDetailFocusIndex((i) => (i === 1 ? 2 : i))
          return
        case 'confirm':
          activateDetailFocus(detailFocusIndex)
          return
        case 'prevStream':
        case 'nextStream':
          activateDetailFocus(1)
          return
        case 'toggleSubtitles':
          activateDetailFocus(2)
          return
        case 'back':
        case 'menu':
          setSelectedItem(null)
          setZone(detailReturnZone)
          return
        default:
          return
      }
    }

    if (zone === 'filters') {
      switch (action) {
        case 'left':
          setTabIndex((i) => Math.max(0, i - 1))
          return
        case 'right':
          setTabIndex((i) => Math.min(TABS.length, i + 1))
          return
        case 'down':
          setZone('rows')
          setRowIndex(0)
          setColIndex(0)
          return
        case 'confirm':
          if (tabIndex === TABS.length) {
            openKeyboard(searchQuery)
          } else {
            setTab(TABS[tabIndex])
            setRowIndex(0)
            setColIndex(0)
          }
          return
        case 'prevStream':
          switchTab(-1)
          return
        case 'nextStream':
          switchTab(1)
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
    {
      const row = rows[rowIndex]
      // Must match how many cards the row actually renders (ROW_PREVIEW_CAP),
      // not the full underlying catalog page, or focus can land on an index
      // nothing in the DOM corresponds to.
      const rowLen = row ? Math.min(row.items.length, ROW_PREVIEW_CAP) : 0
      switch (action) {
        case 'up':
          if (rowIndex === 0) {
            setZone('filters')
          } else {
            setRowIndex((r) => r - 1)
            setColIndex(0)
          }
          return
        case 'down':
          if (rowIndex < rows.length - 1) {
            setRowIndex(rowIndex + 1)
            setColIndex(0)
          }
          return
        case 'left':
          setColIndex((c) => Math.max(0, c - 1))
          return
        case 'right':
          setColIndex((c) => Math.min(rowLen, c + 1))
          return
        case 'prevStream':
          switchTab(-1)
          return
        case 'nextStream':
          switchTab(1)
          return
        case 'confirm': {
          if (!row) return
          if (colIndex >= rowLen) {
            if (row.items.length > 0) openExpanded(row)
            return
          }
          const item = row.items[colIndex]
          if (!item) return
          setDetailReturnZone('rows')
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
    }
  }, 'tv')

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

  if (inPlayerView) {
    const progressPct = duration ? Math.min(100, (position / duration) * 100) : 0
    const showBar = controlsVisible || zone === 'sources'
    return (
      <div
        className="relative flex h-screen cursor-none items-center justify-center bg-black"
        style={showBar ? { cursor: 'auto' } : undefined}
        onMouseMove={() => wakeControls(!isPaused)}
      >
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
          onPlay={() => {
            setIsPaused(false)
            wakeControls(true)
          }}
          onPause={() => {
            setIsPaused(true)
            wakeControls(false)
            persistProgress(false)
          }}
          onEnded={() => {
            if (activePlayback?.kind === 'movie') {
              void window.api.progress.clear('movie', activePlayback.id)
              stopPlayback()
              setZone('detail')
              return
            }
            if (activePlayback?.kind === 'series') {
              const next = findNextEpisode(activePlayback.season, activePlayback.episode)
              if (next) {
                void playEpisode(next)
                return
              }
              setMessage(`Finished ${activePlayback.seriesTitle}`)
              stopPlayback()
              setZone('episodes')
            }
          }}
          onTimeUpdate={(event) => {
            const pos = baseOffset + event.currentTarget.currentTime
            setPosition(pos)
            const now = Date.now()
            if (now - lastProgressSaveRef.current > 5000) {
              lastProgressSaveRef.current = now
              persistProgress(false)
            }
          }}
        >
          {subtitleUrl && (
            <track ref={trackRef} kind="subtitles" src={subtitleUrl} default label="Subtitles" />
          )}
        </video>

        <div
          className={`absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/90 to-transparent p-8 transition-opacity duration-300 ${
            showBar ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
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

  if (zone === 'expanded') {
    const row = rows.find((r) => r.key === expandedRowKey)
    return (
      <div className="relative flex h-screen flex-col gap-6 overflow-hidden bg-bg px-10 py-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">
            {expandedRowKey === 'search' ? `Search: "${searchQuery}"` : (row?.label ?? 'Browse')}
          </h1>
        </header>

        <div
          className="grid flex-1 auto-rows-min grid-cols-6 gap-10 overflow-y-auto p-5"
          onScroll={(event) => {
            const el = event.currentTarget
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 800) void loadMoreExpanded()
          }}
        >
          {expandedItems.map((item, i) => (
            <div key={item.id} ref={(el) => (expandedRefs.current[i] = el)} className="scroll-m-10">
              <FocusableCard
                item={toCardItem(item)}
                aspect="portrait"
                focused={expandedIndex === i}
                onClick={() => {
                  setExpandedIndex(i)
                  setDetailReturnZone('expanded')
                  setSelectedItem(item)
                  setZone('detail')
                }}
              />
            </div>
          ))}
        </div>

        {expandedLoading && <p className="text-center text-sm text-muted">Loading more...</p>}
        <footer className="text-sm text-muted">{message}</footer>
      </div>
    )
  }

  const selectedCard = selectedItem ? toCardItem(selectedItem) : null
  const releaseDate = selectedItem ? formatReleaseDate(selectedItem.released) : null

  const playLabel = (() => {
    if (!selectedItem) return '▶ Play'
    if (selectedItem.type === 'movie') {
      return isResumable(progress) ? `▶ Resume at ${formatTime(progress.positionSeconds)}` : '▶ Play'
    }
    if (isResumable(progress) && progress.season != null && progress.episode != null) {
      return `▶ Resume S${progress.season}E${progress.episode}`
    }
    const first = episodes.length > 0 ? sortEpisodes(episodes)[0] : null
    return first ? `▶ Play S${first.season}E${first.episode}` : '▶ Play'
  })()

  return (
    <div className="relative flex h-screen bg-bg">
      <motion.div layout className="flex flex-1 flex-col gap-6 overflow-hidden px-10 py-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">
            {inEpisodesView && selectedItem ? selectedItem.name : 'TV'}
          </h1>
        </header>

        {inEpisodesView ? (
          <>
            <div className="flex gap-3">
              {seasonsList.map((s, i) => (
                <div
                  key={s}
                  onClick={() => {
                    setEpisodeSubZone('seasons')
                    setSeasonIndex(i)
                    setEpisodeIndex(0)
                  }}
                  className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    seasonIndex === i ? 'bg-accent text-white' : 'bg-surface text-muted'
                  } ${
                    episodeSubZone === 'seasons' && seasonIndex === i
                      ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg'
                      : ''
                  }`}
                >
                  {s === 0 ? 'Specials' : `Season ${s}`}
                </div>
              ))}
            </div>

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
              {episodes.length === 0 && <span className="text-muted">Loading episodes...</span>}
              {episodesForSeason.map((ep, i) => (
                <div
                  key={ep.id}
                  ref={(el) => (episodeRefs.current[i] = el)}
                  onClick={() => {
                    setEpisodeSubZone('list')
                    setEpisodeIndex(i)
                    void playEpisode(ep)
                  }}
                  className={`scroll-m-8 flex cursor-pointer items-center gap-4 rounded-xl px-4 py-3 transition-colors ${
                    episodeSubZone === 'list' && episodeIndex === i ? 'bg-surface-hi shadow-focus' : 'bg-surface'
                  }`}
                >
                  <span className="w-12 shrink-0 text-sm font-semibold text-muted">
                    {progress?.type === 'series' &&
                    progress.season === ep.season &&
                    progress.episode === ep.episode
                      ? '▶ '
                      : ''}
                    E{ep.episode}
                  </span>
                  {ep.thumbnail && (
                    <img src={ep.thumbnail} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" />
                  )}
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <span className="truncate font-medium">{ep.name}</span>
                    {ep.overview && <span className="line-clamp-2 text-xs text-muted">{ep.overview}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-3">
              {TABS.map((t, i) => (
                <div
                  key={t}
                  onClick={() => {
                    setZone('filters')
                    setTabIndex(i)
                    setTab(t)
                    setRowIndex(0)
                    setColIndex(0)
                  }}
                  className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    tab === t ? 'bg-accent text-white' : 'bg-surface text-muted'
                  } ${zone === 'filters' && tabIndex === i ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}
                >
                  {tabLabel(t)}
                </div>
              ))}
              <div
                onClick={() => {
                  setZone('filters')
                  setTabIndex(TABS.length)
                  openKeyboard(searchQuery)
                }}
                className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                  searchQuery ? 'bg-accent text-white' : 'bg-surface text-muted'
                } ${
                  zone === 'filters' && tabIndex === TABS.length
                    ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg'
                    : ''
                }`}
              >
                {searchQuery ? `🔍 "${searchQuery}"` : '🔍 Search'}
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-8 overflow-y-auto">
              {rows.map((row, i) => (
                <div key={row.key} ref={(el) => (rowRefs.current[i] = el)}>
                  <CategoryRow
                    label={row.label}
                    items={row.items.slice(0, ROW_PREVIEW_CAP).map(toCardItem)}
                    focused={zone === 'rows' && rowIndex === i}
                    focusedIndex={colIndex}
                    aspect="portrait"
                    onSelect={(index) => {
                      setZone('rows')
                      setRowIndex(i)
                      setColIndex(index)
                      setDetailReturnZone('rows')
                      setSelectedItem(row.items[index])
                      setZone('detail')
                    }}
                    onSeeMore={() => openExpanded(row)}
                  />
                </div>
              ))}
            </div>
          </>
        )}

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

            <div className="mt-auto flex flex-col gap-3">
              <button
                onClick={() => {
                  setDetailFocusIndex(0)
                  if (selectedItem.type === 'series') playSeriesFromDetail()
                  else void playMovie(selectedItem, { auto: true })
                }}
                className={`rounded-xl bg-accent-gradient px-6 py-4 text-lg font-semibold text-white shadow-focus transition-shadow ${
                  detailFocusIndex === 0 ? 'ring-2 ring-white/50 ring-offset-2 ring-offset-bg' : ''
                }`}
              >
                {playLabel}
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setDetailFocusIndex(1)
                    if (selectedItem.type === 'series') {
                      setEpisodeSubZone('seasons')
                      setZone('episodes')
                    } else {
                      void playMovie(selectedItem, { auto: false })
                    }
                  }}
                  className={`flex-1 rounded-xl bg-surface-hi px-5 py-3 text-sm font-semibold text-muted transition-colors hover:text-white ${
                    detailFocusIndex === 1 ? 'text-white ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''
                  }`}
                >
                  {selectedItem.type === 'series' ? 'Episodes' : 'Source'}
                </button>
                <button
                  onClick={() => {
                    setDetailFocusIndex(2)
                    toggleLibrary()
                  }}
                  className={`flex-1 rounded-xl px-5 py-3 text-sm font-semibold transition-colors ${
                    isSelectedInLibrary ? 'bg-accent/20 text-accent' : 'bg-surface-hi text-muted hover:text-white'
                  } ${detailFocusIndex === 2 ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}
                >
                  {isSelectedInLibrary ? '✓ In Library' : '+ Library'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {sourcesOverlay}

      {zone === 'keyboard' && (
        <OnScreenKeyboard
          label={tab === 'library' ? 'Search My Library' : `Search ${tabLabel(tab)}`}
          value={kbValue}
          shift={kbShift}
          focusedRow={kbRow}
          focusedCol={kbCol}
          onChange={setKbValue}
          onSubmit={() => submitKeyboard(kbValue)}
          onCancel={cancelKeyboard}
          onKeyPress={pressVirtualKey}
        />
      )}
    </div>
  )
}
