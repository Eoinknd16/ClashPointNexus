import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FocusableCard, type CardItem } from '../components/FocusableCard'
import { useNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'
import { useNavigationStore } from '../state/navigationStore'
import type { GameEntry } from '@shared/steamTypes'

const COLUMNS = 5
const FILTERS = ['installed', 'all'] as const
type Filter = (typeof FILTERS)[number]
type Zone = 'filters' | 'grid' | 'detail'

function steamHeaderUrl(appId: number): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`
}

function formatPlaytime(minutes: number): string {
  if (minutes <= 0) return 'Not played yet'
  const hours = minutes / 60
  return hours >= 10 ? `${Math.round(hours)} hrs` : `${hours.toFixed(1)} hrs`
}

function formatLastPlayed(lastPlayed: number): string {
  if (lastPlayed <= 0) return 'Never played'
  return `Last played ${new Date(lastPlayed * 1000).toLocaleDateString()}`
}

function toCardItem(game: GameEntry): CardItem {
  return {
    id: game.id,
    title: game.name,
    subtitle: game.installed ? formatPlaytime(game.playtimeForeverMinutes) : 'Not installed',
    imageUrl: game.imageAppId ? steamHeaderUrl(game.imageAppId) : undefined
  }
}

function launchOrInstall(game: GameEntry, setMessage: (message: string) => void): void {
  if (game.launch.type === 'steam' && !game.installed) {
    setMessage(`Installing ${game.name}...`)
    window.api.steam.install(game.launch.appId)
  } else {
    setMessage(`Launching ${game.name}...`)
    window.api.steam.launch(game.launch)
  }
}

export function GamesScreen(): JSX.Element {
  const [allGames, setAllGames] = useState<GameEntry[]>([])
  const [filter, setFilter] = useState<Filter>('installed')
  const [zone, setZone] = useState<Zone>('filters')
  const [filterIndex, setFilterIndex] = useState(0)
  const [gridIndex, setGridIndex] = useState(0)
  const [selectedGame, setSelectedGame] = useState<GameEntry | null>(null)
  const message = useStatusStore((s) => s.message)
  const setMessage = useStatusStore((s) => s.setMessage)
  const goHome = useNavigationStore((s) => s.goHome)
  const cardRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    if (zone !== 'grid') return
    cardRefs.current[gridIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, gridIndex])

  useEffect(() => {
    let cancelled = false
    window.api.steam.getLibrary().then((result) => {
      if (cancelled) return
      setAllGames(result.games)
      if (result.needsApiKey) {
        setMessage('Add a Steam Web API key to steam.config.json to browse your full library')
      } else if (result.error) {
        setMessage(`Steam Web API error: ${result.error}`)
      } else {
        setMessage('Ready')
      }
    })
    return () => {
      cancelled = true
    }
  }, [setMessage])

  // Most-recently-played first, in both filters — same effect as a separate
  // "Continue Playing" row without needing one.
  const games = [...(filter === 'installed' ? allGames.filter((g) => g.installed) : allGames)].sort(
    (a, b) => b.lastPlayed - a.lastPlayed
  )
  const cards = games.map(toCardItem)

  function switchFilter(direction: 1 | -1): void {
    const next = Math.max(0, Math.min(FILTERS.length - 1, filterIndex + direction))
    setFilterIndex(next)
    setFilter(FILTERS[next])
    setGridIndex(0)
  }

  useNavListener((action) => {
    if (zone === 'detail') {
      switch (action) {
        case 'confirm':
          if (selectedGame) launchOrInstall(selectedGame, setMessage)
          return
        case 'back':
        case 'menu':
          setSelectedGame(null)
          setZone('grid')
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
          setZone('grid')
          setGridIndex(0)
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
        if (gridIndex < COLUMNS) {
          setZone('filters')
        } else {
          setGridIndex((i) => Math.max(0, i - COLUMNS))
        }
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
      case 'confirm': {
        const game = games[gridIndex]
        if (!game) return
        setSelectedGame(game)
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

  const selectedCard = selectedGame ? toCardItem(selectedGame) : null

  return (
    <div className="relative flex h-screen bg-bg">
      <motion.div layout className="flex flex-1 flex-col gap-6 overflow-hidden px-10 py-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Games</h1>
        </header>

        <div className="flex gap-3">
          {FILTERS.map((f, i) => (
            <div
              key={f}
              onClick={() => {
                setZone('filters')
                setFilterIndex(i)
                setFilter(f)
                setGridIndex(0)
              }}
              className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                filter === f ? 'bg-accent text-white' : 'bg-surface text-muted'
              } ${zone === 'filters' && filterIndex === i ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}
            >
              {f === 'installed' ? 'Installed' : 'All Games'}
            </div>
          ))}
        </div>

        {/* Padding here (not just gap) is load-bearing — a focused card scales
            up via transform, and needs room within this box or it clips. */}
        <div className="grid flex-1 auto-rows-min grid-cols-5 gap-6 overflow-y-auto p-3">
          {cards.length === 0 && <span className="text-muted">No games in this view yet.</span>}
          {cards.map((card, i) => (
            <div key={card.id} ref={(el) => (cardRefs.current[i] = el)}>
              <FocusableCard
                item={card}
                focused={zone === 'grid' && gridIndex === i}
                onClick={() => {
                  setZone('grid')
                  setGridIndex(i)
                  setSelectedGame(games[i])
                  setZone('detail')
                }}
              />
            </div>
          ))}
        </div>

        <footer className="text-sm text-muted">{message}</footer>
      </motion.div>

      <AnimatePresence mode="popLayout">
        {selectedGame && selectedCard && (
          <motion.div
            key="detail"
            layout
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="shadow-panel flex w-[420px] shrink-0 flex-col gap-6 bg-surface p-8"
          >
            <div className="aspect-[2/1] w-full overflow-hidden rounded-xl bg-surface-hi">
              {selectedCard.imageUrl && (
                <img src={selectedCard.imageUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>

            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-bold leading-tight">{selectedGame.name}</h2>
              <p className="text-muted">
                {selectedGame.installed
                  ? formatPlaytime(selectedGame.playtimeForeverMinutes)
                  : 'Not installed'}
              </p>
              <p className="text-sm text-muted">{formatLastPlayed(selectedGame.lastPlayed)}</p>
            </div>

            <button
              onClick={() => launchOrInstall(selectedGame, setMessage)}
              className="mt-auto rounded-xl bg-accent-gradient px-6 py-4 text-lg font-semibold text-white shadow-focus"
            >
              {selectedGame.installed ? '▶ Play' : '⬇ Install'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
