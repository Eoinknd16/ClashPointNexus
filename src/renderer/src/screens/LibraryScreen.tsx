import { useEffect, useRef, useState } from 'react'
import { Film, Gamepad2, Tv, type LucideIcon } from 'lucide-react'
import { FocusableCard, type CardItem } from '../components/FocusableCard'
import { useNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'
import { useNavigationStore } from '../state/navigationStore'
import type { GameEntry } from '@shared/steamTypes'
import type { LibraryEntry } from '@shared/libraryTypes'

const COLUMNS = 5
const FILTERS = ['all', 'games', 'movies', 'series'] as const
type Filter = (typeof FILTERS)[number]
type Zone = 'filters' | 'grid'

type LibraryItem = { kind: 'game'; game: GameEntry } | { kind: 'content'; entry: LibraryEntry }

function filterLabel(f: Filter): string {
  switch (f) {
    case 'all':
      return 'All'
    case 'games':
      return 'Games'
    case 'movies':
      return 'Movies'
    case 'series':
      return 'Series'
  }
}

function filterIcon(f: Filter): LucideIcon | null {
  switch (f) {
    case 'games':
      return Gamepad2
    case 'movies':
      return Film
    case 'series':
      return Tv
    default:
      return null
  }
}

// Steam's CDN has several differently-named assets per app — same fallback
// chain used on the Games screen.
function steamImageCandidates(appId: number): string[] {
  const base = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}`
  return [`${base}/header.jpg`, `${base}/capsule_616x353.jpg`, `${base}/library_hero.jpg`]
}

function toCardItem(item: LibraryItem): CardItem {
  if (item.kind === 'game') {
    const g = item.game
    const steamCandidates = g.imageAppId ? steamImageCandidates(g.imageAppId) : []
    return {
      id: `game:${g.id}`,
      title: g.name,
      subtitle: g.installed ? 'Installed' : 'Not installed',
      imageUrl: g.imageDataUrl ?? steamCandidates[0],
      imageFallbacks: g.imageDataUrl ? undefined : steamCandidates.slice(1),
      icon: Gamepad2,
      gradientDirection: 'bg-gradient-to-br',
      favorite: g.favorite
    }
  }
  const e = item.entry
  return {
    id: `content:${e.type}:${e.id}`,
    title: e.name,
    subtitle: e.type === 'movie' ? 'Movie' : 'Series',
    imageUrl: e.poster ?? undefined,
    icon: e.type === 'movie' ? Film : Tv,
    gradientDirection: 'bg-gradient-to-bl'
  }
}

function launchOrInstallGame(game: GameEntry, setMessage: (message: string) => void): void {
  if (game.launch.type === 'steam' && !game.installed) {
    setMessage(`Installing ${game.name}...`)
    window.api.steam.install(game.launch.appId)
  } else {
    setMessage(`Launching ${game.name}...`)
    window.api.steam.launch(game.launch)
  }
}

/**
 * Unified "everything you own" view across Steam games and your added movies/
 * series — the mockup's "Library" nav item. Deliberately thin: confirming an
 * item either launches/installs it directly (games) or hands off to the TV
 * screen's own detail panel (movies/series, via the same PendingContinueAction
 * the Home screen's Continue card already uses) rather than duplicating a
 * second full detail UI here.
 */
export function LibraryScreen(): JSX.Element {
  const [games, setGames] = useState<GameEntry[]>([])
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [filterIndex, setFilterIndex] = useState(0)
  const [zone, setZone] = useState<Zone>('filters')
  const [gridIndex, setGridIndex] = useState(0)
  const message = useStatusStore((s) => s.message)
  const setMessage = useStatusStore((s) => s.setMessage)
  const goTo = useNavigationStore((s) => s.goTo)
  const goHome = useNavigationStore((s) => s.goHome)
  const cardRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    window.api.steam
      .getLibrary()
      .then((result) => setGames(result.games))
      .catch(() => setGames([]))
    window.api.library
      .list()
      .then(setEntries)
      .catch(() => setEntries([]))
  }, [])

  useEffect(() => {
    if (zone !== 'grid') return
    cardRefs.current[gridIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, gridIndex])

  const gameItems: LibraryItem[] = [...games]
    .sort((a, b) => b.lastPlayed - a.lastPlayed)
    .map((game) => ({ kind: 'game', game }))
  const movieItems: LibraryItem[] = entries
    .filter((e) => e.type === 'movie')
    .sort((a, b) => b.addedAt - a.addedAt)
    .map((entry) => ({ kind: 'content', entry }))
  const seriesItems: LibraryItem[] = entries
    .filter((e) => e.type === 'series')
    .sort((a, b) => b.addedAt - a.addedAt)
    .map((entry) => ({ kind: 'content', entry }))

  const items: LibraryItem[] =
    filter === 'games'
      ? gameItems
      : filter === 'movies'
        ? movieItems
        : filter === 'series'
          ? seriesItems
          : [...gameItems, ...movieItems, ...seriesItems]
  const cards = items.map(toCardItem)

  function toggleFavorite(item: LibraryItem | undefined): void {
    if (!item || item.kind !== 'game') return
    const game = item.game
    const nextFavorite = !game.favorite
    setGames((prev) => prev.map((g) => (g.id === game.id ? { ...g, favorite: nextFavorite } : g)))
    window.api.steam.toggleFavorite(game.id).catch(() => {
      setGames((prev) => prev.map((g) => (g.id === game.id ? { ...g, favorite: game.favorite } : g)))
      setMessage(`Couldn't save favorite for ${game.name}`)
    })
  }

  function activateItem(item: LibraryItem | undefined): void {
    if (!item) return
    if (item.kind === 'game') {
      launchOrInstallGame(item.game, setMessage)
      return
    }
    const entry = item.entry
    goTo('tv', {
      kind: 'tv',
      tab: entry.type,
      item: {
        id: entry.id,
        type: entry.type,
        name: entry.name,
        poster: entry.poster,
        description: null,
        year: null,
        released: null,
        genres: []
      }
    })
  }

  function switchFilter(direction: 1 | -1): void {
    const next = Math.max(0, Math.min(FILTERS.length - 1, filterIndex + direction))
    setFilterIndex(next)
    setFilter(FILTERS[next])
    setGridIndex(0)
  }

  useNavListener((action) => {
    if (zone === 'filters') {
      switch (action) {
        case 'left':
          setFilterIndex((i) => Math.max(0, i - 1))
          return
        case 'right':
          setFilterIndex((i) => Math.min(FILTERS.length - 1, i + 1))
          return
        case 'down':
          setZone('grid')
          return
        case 'confirm':
          setFilter(FILTERS[filterIndex])
          setGridIndex(0)
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

    // zone === 'grid'
    switch (action) {
      case 'up':
        if (gridIndex < COLUMNS) setZone('filters')
        else setGridIndex((i) => Math.max(0, i - COLUMNS))
        return
      case 'down':
        setGridIndex((i) => (i + COLUMNS < cards.length ? i + COLUMNS : i))
        return
      case 'left':
        setGridIndex((i) => (i % COLUMNS === 0 ? i : i - 1))
        return
      case 'right':
        setGridIndex((i) => (i % COLUMNS === COLUMNS - 1 || i === cards.length - 1 ? i : i + 1))
        return
      case 'prevStream':
        switchFilter(-1)
        return
      case 'nextStream':
        switchFilter(1)
        return
      case 'toggleSubtitles':
        toggleFavorite(items[gridIndex])
        return
      case 'confirm':
        activateItem(items[gridIndex])
        return
      case 'back':
      case 'menu':
        goHome()
        return
      default:
        return
    }
  }, 'library')

  return (
    <div className="flex h-screen flex-col gap-6 bg-bg px-10 py-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Library</h1>
        <p className="text-sm text-muted">Everything you own, in one place.</p>
      </header>

      <div className="flex gap-3">
        {FILTERS.map((f, i) => {
          const Icon = filterIcon(f)
          return (
            <div
              key={f}
              onClick={() => {
                setZone('filters')
                setFilterIndex(i)
                setFilter(f)
                setGridIndex(0)
              }}
              className={`flex cursor-pointer items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                filter === f ? 'bg-accent text-white' : 'bg-surface text-muted'
              } ${zone === 'filters' && filterIndex === i ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {filterLabel(f)}
            </div>
          )
        })}
      </div>

      <div className="grid flex-1 auto-rows-min grid-cols-5 gap-10 overflow-y-auto p-5">
        {cards.length === 0 && <span className="text-muted">Nothing here yet.</span>}
        {cards.map((card, i) => (
          <div key={card.id} ref={(el) => (cardRefs.current[i] = el)} className="scroll-m-10">
            <FocusableCard
              item={card}
              focused={zone === 'grid' && gridIndex === i}
              onClick={() => {
                setZone('grid')
                setGridIndex(i)
                activateItem(items[i])
              }}
            />
          </div>
        ))}
      </div>

      <footer className="text-sm text-muted">{message}</footer>
    </div>
  )
}
