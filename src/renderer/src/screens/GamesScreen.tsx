import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CardArt, FocusableCard, type CardItem } from '../components/FocusableCard'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { KEY_ROWS, applyKey, clampKeyboardFocus } from '../components/onScreenKeyboardLayout'
import { useNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'
import { useNavigationStore } from '../state/navigationStore'
import type { GameEntry } from '@shared/steamTypes'

const COLUMNS = 5
const FILTERS = ['installed', 'all'] as const
type Filter = (typeof FILTERS)[number]
// filterIndex ranges 0..FILTERS.length inclusive — FILTERS.length itself is a
// search bubble, reachable by d-pad but not by the bumpers (switchFilter stays
// clamped to the real filters, so a quick bumper tap can't pop the keyboard).
type Zone = 'filters' | 'grid' | 'detail' | 'keyboard'

// Steam's CDN has several differently-named assets per app, and not every
// one exists for every appId (older/delisted/unusual titles especially) —
// tried in this order as a fallback chain, not just the first one.
function steamImageCandidates(appId: number): string[] {
  const base = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}`
  return [`${base}/header.jpg`, `${base}/capsule_616x353.jpg`, `${base}/library_hero.jpg`]
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
  const steamCandidates = game.imageAppId ? steamImageCandidates(game.imageAppId) : []
  return {
    id: game.id,
    title: game.name,
    subtitle: game.installed ? formatPlaytime(game.playtimeForeverMinutes) : 'Not installed',
    imageUrl: game.imageDataUrl ?? steamCandidates[0],
    imageFallbacks: game.imageDataUrl ? undefined : steamCandidates.slice(1),
    icon: '🎮',
    gradientDirection: 'bg-gradient-to-br'
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
  const [searchQuery, setSearchQuery] = useState('')
  const [zone, setZone] = useState<Zone>('filters')
  const [filterIndex, setFilterIndex] = useState(0)
  const [gridIndex, setGridIndex] = useState(0)
  const [selectedGame, setSelectedGame] = useState<GameEntry | null>(null)
  const [kbRow, setKbRow] = useState(0)
  const [kbCol, setKbCol] = useState(0)
  const [kbValue, setKbValue] = useState('')
  const [kbShift, setKbShift] = useState(false)
  const message = useStatusStore((s) => s.message)
  const setMessage = useStatusStore((s) => s.setMessage)
  const goHome = useNavigationStore((s) => s.goHome)
  const consumePendingContinue = useNavigationStore((s) => s.consumePendingContinue)
  const cardRefs = useRef<Array<HTMLDivElement | null>>([])

  // Home screen's "Continue Playing" card deep-links here — unlike TV (which
  // just lands on the detail panel), a game launch is low-stakes enough to
  // fire immediately, matching how clicking any game card already behaves.
  useEffect(() => {
    const pending = consumePendingContinue()
    if (pending?.kind === 'game') launchOrInstall(pending.game, setMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Searching looks across every game regardless of the Installed/All filter —
  // the subtitle line already shows install state, so there's no ambiguity.
  // Most-recently-played first either way, same effect as a separate
  // "Continue Playing" row without needing one.
  const trimmedQuery = searchQuery.trim().toLowerCase()
  const baseGames = trimmedQuery
    ? allGames.filter((g) => g.name.toLowerCase().includes(trimmedQuery))
    : filter === 'installed'
      ? allGames.filter((g) => g.installed)
      : allGames
  const games = [...baseGames].sort((a, b) => b.lastPlayed - a.lastPlayed)
  const cards = games.map(toCardItem)

  function switchFilter(direction: 1 | -1): void {
    const next = Math.max(0, Math.min(FILTERS.length - 1, filterIndex + direction))
    setFilterIndex(next)
    setFilter(FILTERS[next])
    setSearchQuery('')
    setGridIndex(0)
  }

  function openKeyboard(initialValue: string): void {
    setKbValue(initialValue)
    setKbShift(false)
    setKbRow(0)
    setKbCol(0)
    setZone('keyboard')
  }

  function submitKeyboard(finalValue: string): void {
    setSearchQuery(finalValue.trim())
    setGridIndex(0)
    setZone('filters')
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
        case 'toggleSubtitles':
          pressVirtualKey('BACKSPACE')
          return
        case 'volumeUp':
          pressVirtualKey('SHIFT')
          return
        case 'nextStream':
          submitKeyboard(kbValue)
          return
        case 'back':
        case 'menu':
          cancelKeyboard()
          return
        default:
          return
      }
    }

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
          setFilterIndex((i) => Math.min(FILTERS.length, i + 1))
          return
        case 'down':
          setZone('grid')
          setGridIndex(0)
          return
        case 'confirm':
          if (filterIndex === FILTERS.length) {
            openKeyboard(searchQuery)
          } else {
            setFilter(FILTERS[filterIndex])
            setSearchQuery('')
            setGridIndex(0)
          }
          return
        case 'prevStream':
          switchFilter(-1)
          return
        case 'nextStream':
          switchFilter(1)
          return
        case 'search':
          setFilterIndex(FILTERS.length)
          openKeyboard(searchQuery)
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
      case 'search':
        setZone('filters')
        setFilterIndex(FILTERS.length)
        openKeyboard(searchQuery)
        return
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
  }, 'games')

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
                setSearchQuery('')
                setGridIndex(0)
              }}
              className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                filter === f && !searchQuery ? 'bg-accent text-white' : 'bg-surface text-muted'
              } ${zone === 'filters' && filterIndex === i ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}
            >
              {f === 'installed' ? 'Installed' : 'All Games'}
            </div>
          ))}
          <div
            onClick={() => {
              setZone('filters')
              setFilterIndex(FILTERS.length)
              openKeyboard(searchQuery)
            }}
            className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              searchQuery ? 'bg-accent text-white' : 'bg-surface text-muted'
            } ${
              zone === 'filters' && filterIndex === FILTERS.length
                ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg'
                : ''
            }`}
          >
            {searchQuery ? `🔍 "${searchQuery}"` : '🔍 Search'}
          </div>
        </div>

        {/* transform: scale() doesn't reserve extra layout space, so a focused
            card grows past its own grid cell — the gap has to be wide enough
            to absorb that growth (plus the glow) before it reaches the next
            card, and the outer padding covers the container's own edges. */}
        <div className="grid flex-1 auto-rows-min grid-cols-5 gap-10 overflow-y-auto p-5">
          {cards.length === 0 && (
            <span className="text-muted">
              {trimmedQuery ? `No games matching "${searchQuery}"` : 'No games in this view yet.'}
            </span>
          )}
          {cards.map((card, i) => (
            // scroll-m-10 matches the grid's gap-10 — without it, scrollIntoView's
            // "nearest" snaps this element flush to the scroll container's edge,
            // then the card scales/glows past that edge with no room left.
            <div key={card.id} ref={(el) => (cardRefs.current[i] = el)} className="scroll-m-10">
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
              <CardArt item={selectedCard} className="h-full w-full" />
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

      {zone === 'keyboard' && (
        <OnScreenKeyboard
          label="Search Games"
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
