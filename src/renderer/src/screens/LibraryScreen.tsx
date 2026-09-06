import { useEffect, useRef, useState } from 'react'
import { Film, Gamepad2, Tv } from 'lucide-react'
import { CategoryRow } from '../components/CategoryRow'
import type { CardItem } from '../components/FocusableCard'
import { useNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'
import { useNavigationStore } from '../state/navigationStore'
import type { GameEntry } from '@shared/steamTypes'
import type { LibraryEntry } from '@shared/libraryTypes'
import type { CatalogItem } from '@shared/stremioTypes'

type LibraryItem =
  | { kind: 'game'; game: GameEntry }
  | { kind: 'content'; entry: LibraryEntry }
  | { kind: 'continueMovie'; item: CatalogItem }

interface Section {
  id: string
  label: string
  items: LibraryItem[]
  aspect: 'landscape' | 'portrait'
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
  if (item.kind === 'continueMovie') {
    const c = item.item
    return {
      id: `continue:${c.id}`,
      title: c.name,
      subtitle: 'Continue Watching',
      imageUrl: c.poster ?? undefined,
      icon: Film,
      gradientDirection: 'bg-gradient-to-bl'
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
 * A curated "what I actually care about" view, not an exhaustive dump —
 * favorited games (not your whole Steam library), whatever movies/series
 * you've explicitly added, and a Continue Watching row for movies in
 * progress (series already get this on the TV screen's own browse rows).
 * Confirming an item either launches/installs it directly (games) or hands
 * off to the TV screen's own detail panel (movies/series, via the same
 * PendingContinueAction the Home screen's Continue card already uses)
 * rather than duplicating a second full detail UI here.
 */
export function LibraryScreen(): JSX.Element {
  const [games, setGames] = useState<GameEntry[]>([])
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [continueMovies, setContinueMovies] = useState<CatalogItem[]>([])
  const [rowIndex, setRowIndex] = useState(0)
  const [colIndex, setColIndex] = useState(0)
  const message = useStatusStore((s) => s.message)
  const setMessage = useStatusStore((s) => s.setMessage)
  const goTo = useNavigationStore((s) => s.goTo)
  const goHome = useNavigationStore((s) => s.goHome)
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    window.api.steam
      .getLibrary()
      .then((result) => setGames(result.games))
      .catch(() => setGames([]))
    window.api.library
      .list()
      .then(setEntries)
      .catch(() => setEntries([]))
    // Same "recent progress, resolved via Cinemeta" pipeline the TV screen's
    // own browse rows already use for series — just called for movies here.
    window.api.stremio
      .getContinueWatching('movie')
      .then(setContinueMovies)
      .catch(() => setContinueMovies([]))
  }, [])

  const favoriteGameItems: LibraryItem[] = [...games]
    .filter((g) => g.favorite)
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
  const continueItems: LibraryItem[] = continueMovies.map((item) => ({ kind: 'continueMovie', item }))

  const sections: Section[] = [
    { id: 'continue', label: 'Continue Watching', items: continueItems, aspect: 'portrait' as const },
    { id: 'favoriteGames', label: 'Favorite Games', items: favoriteGameItems, aspect: 'landscape' as const },
    { id: 'tvShows', label: 'TV Shows', items: seriesItems, aspect: 'portrait' as const },
    { id: 'movies', label: 'Movies', items: movieItems, aspect: 'portrait' as const }
  ].filter((section) => section.items.length > 0)

  const clampedRowIndex = Math.min(rowIndex, Math.max(0, sections.length - 1))
  const activeSection: Section | undefined = sections[clampedRowIndex]
  const clampedColIndex = activeSection ? Math.min(colIndex, Math.max(0, activeSection.items.length - 1)) : 0

  useEffect(() => {
    rowRefs.current[clampedRowIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [clampedRowIndex])

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
    if (item.kind === 'continueMovie') {
      goTo('tv', { kind: 'tv', tab: 'movie', item: item.item })
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

  useNavListener((action) => {
    switch (action) {
      case 'up':
        setRowIndex((i) => Math.max(0, i - 1))
        setColIndex(0)
        return
      case 'down':
        setRowIndex((i) => Math.min(sections.length - 1, i + 1))
        setColIndex(0)
        return
      case 'left':
        setColIndex((i) => Math.max(0, i - 1))
        return
      case 'right':
        setColIndex((i) => Math.min((activeSection?.items.length ?? 1) - 1, i + 1))
        return
      case 'toggleSubtitles':
        toggleFavorite(activeSection?.items[clampedColIndex])
        return
      case 'confirm':
        activateItem(activeSection?.items[clampedColIndex])
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
        <p className="text-sm text-muted">Your favorite games, your shows, and what you're watching.</p>
      </header>

      <div className="flex flex-1 flex-col gap-8 overflow-y-auto p-2">
        {sections.length === 0 && (
          <span className="text-muted">
            Nothing here yet — favorite a game, or add a movie/show to your library from the TV screen.
          </span>
        )}
        {sections.map((section, i) => (
          <div key={section.id} ref={(el) => (rowRefs.current[i] = el)}>
            <CategoryRow
              label={section.label}
              items={section.items.map(toCardItem)}
              focused={clampedRowIndex === i}
              focusedIndex={clampedRowIndex === i ? clampedColIndex : 0}
              aspect={section.aspect}
              onSelect={(index) => {
                setRowIndex(i)
                setColIndex(index)
                activateItem(section.items[index])
              }}
            />
          </div>
        ))}
      </div>

      <footer className="text-sm text-muted">{message}</footer>
    </div>
  )
}
