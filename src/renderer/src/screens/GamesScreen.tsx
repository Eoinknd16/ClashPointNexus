import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Calendar, Download, Gamepad2, Play, Search, Star, Trophy, type LucideIcon } from 'lucide-react'
import { CardArt, FocusableCard, type CardItem } from '../components/FocusableCard'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { KEY_ROWS, applyKey, clampKeyboardFocus } from '../components/onScreenKeyboardLayout'
import { useNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'
import { useNavigationStore } from '../state/navigationStore'
import type { AchievementProgress, GameEntry, GameStoreInfo } from '@shared/steamTypes'

const COLUMNS = 5
const FILTERS = ['installed', 'notInstalled', 'all', 'favorites', 'controllerFriendly'] as const
type Filter = (typeof FILTERS)[number]

function filterLabel(f: Filter): string {
  switch (f) {
    case 'installed':
      return 'Installed'
    case 'notInstalled':
      return 'Not Installed'
    case 'all':
      return 'All Games'
    case 'favorites':
      return 'Favorites'
    case 'controllerFriendly':
      return 'Controller Friendly'
  }
}

function filterIcon(f: Filter): LucideIcon | null {
  switch (f) {
    case 'favorites':
      return Star
    case 'controllerFriendly':
      return Gamepad2
    default:
      return null
  }
}
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

function gameStatusLabel(game: GameEntry): string | null {
  if (game.downloadProgressPercent != null) return `Downloading ${game.downloadProgressPercent}%`
  if (game.updatePending) return 'Update available'
  return null
}

function gameStatusIcon(game: GameEntry): LucideIcon | null {
  if (game.downloadProgressPercent != null) return Download
  if (game.updatePending) return ArrowUp
  return null
}

function toCardItem(game: GameEntry): CardItem {
  const steamCandidates = game.imageAppId ? steamImageCandidates(game.imageAppId) : []
  const status = gameStatusLabel(game)
  return {
    id: game.id,
    title: game.name,
    subtitle: status ?? (game.installed ? formatPlaytime(game.playtimeForeverMinutes) : 'Not installed'),
    imageUrl: game.imageDataUrl ?? steamCandidates[0],
    imageFallbacks: game.imageDataUrl ? undefined : steamCandidates.slice(1),
    icon: Gamepad2,
    gradientDirection: 'bg-gradient-to-br',
    favorite: game.favorite
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
  const [achievements, setAchievements] = useState<AchievementProgress | null>(null)
  const [storeInfo, setStoreInfo] = useState<GameStoreInfo | null>(null)
  const [storeInfoByApp, setStoreInfoByApp] = useState<Record<number, GameStoreInfo | null>>({})
  const message = useStatusStore((s) => s.message)
  const setMessage = useStatusStore((s) => s.setMessage)
  const goHome = useNavigationStore((s) => s.goHome)
  const consumePendingContinue = useNavigationStore((s) => s.consumePendingContinue)
  const cardRefs = useRef<Array<HTMLDivElement | null>>([])
  const isMountedRef = useRef(true)
  const requestedStoreInfoRef = useRef<Set<number>>(new Set())

  useEffect(
    () => () => {
      isMountedRef.current = false
    },
    []
  )

  // Background enrichment for the Controller Friendly filter, which (unlike
  // the on-demand per-selection fetch below) needs to know every owned
  // game's store info up front, not just whichever one is selected. Runs
  // once per appId ever (requestedStoreInfoRef, a ref so it survives this
  // effect re-running when allGames gets a new reference, e.g. from a
  // favorite toggle) — the actual network throttling lives in the main
  // process (service.ts's getStoreInfo), so firing every request at once
  // here is fine. Deliberately no per-run "cancelled" flag: this is a
  // persistent background task, not a fetch tied to a specific input value,
  // so an in-flight request from an earlier run must still land when it
  // resolves rather than being silently dropped — isMountedRef only turns
  // false on a real unmount, not on every allGames change.
  useEffect(() => {
    for (const game of allGames) {
      if (game.launch.type !== 'steam') continue
      const appId = game.launch.appId
      if (requestedStoreInfoRef.current.has(appId)) continue
      requestedStoreInfoRef.current.add(appId)
      window.api.steam
        .getStoreInfo(appId)
        .then((info) => {
          if (isMountedRef.current) setStoreInfoByApp((prev) => ({ ...prev, [appId]: info }))
        })
        .catch(() => {
          if (isMountedRef.current) setStoreInfoByApp((prev) => ({ ...prev, [appId]: null }))
        })
    }
  }, [allGames])

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

  // Only Steam-launched games have a Steam achievements schema at all — non-
  // Steam shortcuts never do. Fetched on demand per selection rather than for
  // the whole library up front, since it's one extra Web API round-trip per
  // game and most of a library is never opened in a given session. Keyed off
  // the appId (a stable primitive), not the selectedGame object itself —
  // toggling favorite replaces that object with a new reference, which would
  // otherwise re-trigger this fetch for no reason.
  const selectedAppId = selectedGame?.launch.type === 'steam' ? selectedGame.launch.appId : null
  useEffect(() => {
    setAchievements(null)
    if (selectedAppId === null) return
    let cancelled = false
    window.api.steam
      .getAchievements(selectedAppId)
      .then((result) => {
        if (!cancelled) setAchievements(result)
      })
      .catch(() => {
        if (!cancelled) setAchievements(null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedAppId])

  // Steam's public storefront API needs no key/account at all — same
  // on-demand-per-selection reasoning as achievements above.
  useEffect(() => {
    setStoreInfo(null)
    if (selectedAppId === null) return
    let cancelled = false
    window.api.steam
      .getStoreInfo(selectedAppId)
      .then((result) => {
        if (!cancelled) setStoreInfo(result)
      })
      .catch(() => {
        if (!cancelled) setStoreInfo(null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedAppId])

  useEffect(() => {
    let cancelled = false
    window.api.steam
      .getLibrary()
      .then((result) => {
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
      .catch((error) => {
        if (cancelled) return
        setMessage(`Failed to load Steam library: ${error instanceof Error ? error.message : String(error)}`)
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
      : filter === 'notInstalled'
        ? allGames.filter((g) => !g.installed)
        : filter === 'favorites'
          ? allGames.filter((g) => g.favorite)
          : filter === 'controllerFriendly'
            ? allGames.filter((g) => {
                if (g.launch.type !== 'steam') return false
                const support = storeInfoByApp[g.launch.appId]?.controllerSupport
                return support === 'full' || support === 'partial'
              })
            : allGames
  const games = [...baseGames].sort((a, b) => b.lastPlayed - a.lastPlayed)
  const cards = games.map(toCardItem)

  const totalSteamGames = allGames.reduce((n, g) => n + (g.launch.type === 'steam' ? 1 : 0), 0)
  const scannedSteamGames = allGames.reduce(
    (n, g) => n + (g.launch.type === 'steam' && g.launch.appId in storeInfoByApp ? 1 : 0),
    0
  )
  const stillScanningControllerSupport = scannedSteamGames < totalSteamGames

  // Optimistic — flips the local flag immediately (grid badge + detail panel
  // both derive from allGames/selectedGame) and rolls back only if the IPC
  // call itself fails, rather than waiting on a round-trip for something this
  // low-stakes.
  function toggleFavorite(game: GameEntry | null | undefined): void {
    if (!game) return
    const nextFavorite = !game.favorite
    setAllGames((prev) => prev.map((g) => (g.id === game.id ? { ...g, favorite: nextFavorite } : g)))
    setSelectedGame((prev) => (prev && prev.id === game.id ? { ...prev, favorite: nextFavorite } : prev))
    window.api.steam.toggleFavorite(game.id).catch(() => {
      setAllGames((prev) => prev.map((g) => (g.id === game.id ? { ...g, favorite: game.favorite } : g)))
      setSelectedGame((prev) => (prev && prev.id === game.id ? { ...prev, favorite: game.favorite } : prev))
      setMessage(`Couldn't save favorite for ${game.name}`)
    })
  }

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
        case 'toggleSubtitles':
          toggleFavorite(selectedGame)
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
      case 'toggleSubtitles':
        toggleFavorite(games[gridIndex])
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
          {FILTERS.map((f, i) => {
            const Icon = filterIcon(f)
            return (
              <div
                key={f}
                onClick={() => {
                  setZone('filters')
                  setFilterIndex(i)
                  setFilter(f)
                  setSearchQuery('')
                  setGridIndex(0)
                }}
                className={`flex cursor-pointer items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                  filter === f && !searchQuery ? 'bg-accent text-white' : 'bg-surface text-muted'
                } ${zone === 'filters' && filterIndex === i ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}
              >
                {Icon && <Icon className="h-4 w-4" />}
                {filterLabel(f)}
              </div>
            )
          })}
          <div
            onClick={() => {
              setZone('filters')
              setFilterIndex(FILTERS.length)
              openKeyboard(searchQuery)
            }}
            className={`flex cursor-pointer items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              searchQuery ? 'bg-accent text-white' : 'bg-surface text-muted'
            } ${
              zone === 'filters' && filterIndex === FILTERS.length
                ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg'
                : ''
            }`}
          >
            <Search className="h-4 w-4" />
            {searchQuery ? `"${searchQuery}"` : 'Search'}
          </div>
        </div>

        {filter === 'controllerFriendly' && stillScanningControllerSupport && (
          <p className="-mt-4 text-xs text-muted">
            Still scanning your library for controller support ({scannedSteamGames}/{totalSteamGames})...
          </p>
        )}

        {/* transform: scale() doesn't reserve extra layout space, so a focused
            card grows past its own grid cell — the gap has to be wide enough
            to absorb that growth (plus the glow) before it reaches the next
            card, and the outer padding covers the container's own edges. */}
        <div className="grid flex-1 auto-rows-min grid-cols-5 gap-10 overflow-y-auto p-5">
          {cards.length === 0 && (
            <span className="text-muted">
              {trimmedQuery
                ? `No games matching "${searchQuery}"`
                : filter === 'favorites'
                  ? 'No favorites yet — Square on a game adds one.'
                  : filter === 'controllerFriendly'
                    ? stillScanningControllerSupport
                      ? 'Still scanning your library — controller-friendly games will appear here as they are found.'
                      : 'No controller-friendly games found in your library.'
                    : 'No games in this view yet.'}
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
            className="shadow-panel flex w-[420px] shrink-0 flex-col gap-6 overflow-y-auto bg-surface p-8"
          >
            <div className="aspect-[2/1] w-full overflow-hidden rounded-xl bg-surface-hi">
              <CardArt item={selectedCard} className="h-full w-full" />
            </div>

            <div className="flex items-start justify-between gap-3">
              <h2 className="text-2xl font-bold leading-tight">{selectedGame.name}</h2>
              <button
                onClick={() => toggleFavorite(selectedGame)}
                title={selectedGame.favorite ? 'Remove favorite' : 'Add favorite (Square)'}
                className={`shrink-0 transition-opacity ${
                  selectedGame.favorite ? 'opacity-100' : 'opacity-30 hover:opacity-70'
                }`}
              >
                <Star className="h-6 w-6 text-yellow-400" fill="currentColor" />
              </button>
            </div>
            <div className="-mt-4 flex flex-col gap-1">
              <p className="text-muted">
                {selectedGame.installed
                  ? formatPlaytime(selectedGame.playtimeForeverMinutes)
                  : 'Not installed'}
              </p>
              <p className="text-sm text-muted">{formatLastPlayed(selectedGame.lastPlayed)}</p>
              {gameStatusLabel(selectedGame) &&
                (() => {
                  const StatusIcon = gameStatusIcon(selectedGame)
                  return (
                    <p className="flex items-center gap-1.5 text-sm font-medium text-accent">
                      {StatusIcon && <StatusIcon className="h-4 w-4" />}
                      {gameStatusLabel(selectedGame)}
                    </p>
                  )
                })()}
              {achievements && (
                <div className="mt-2 flex flex-col gap-1">
                  <p className="flex items-center gap-1.5 text-sm text-muted">
                    <Trophy className="h-4 w-4" /> {achievements.unlocked}/{achievements.total} achievements
                  </p>
                  <div className="h-1.5 w-full rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-accent-gradient"
                      style={{ width: `${Math.round((achievements.unlocked / achievements.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {storeInfo && (
              <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
                {storeInfo.genres.length > 0 && (
                  <p className="text-xs uppercase tracking-wide text-accent">{storeInfo.genres.join(' · ')}</p>
                )}
                {storeInfo.controllerSupport !== 'none' && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <Gamepad2 className="h-3.5 w-3.5" />
                    {storeInfo.controllerSupport === 'full' ? 'Full' : 'Partial'} Controller Support
                  </p>
                )}
                {storeInfo.description && (
                  <p className="line-clamp-4 text-sm text-muted">{storeInfo.description}</p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  {storeInfo.releaseDate && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" /> {storeInfo.releaseDate}
                    </span>
                  )}
                  {storeInfo.metacriticScore != null && <span>Metacritic {storeInfo.metacriticScore}</span>}
                </div>
                {storeInfo.developers.length > 0 && (
                  <p className="text-xs text-muted">Developer: {storeInfo.developers.join(', ')}</p>
                )}
                {storeInfo.publishers.length > 0 &&
                  storeInfo.publishers.join(',') !== storeInfo.developers.join(',') && (
                    <p className="text-xs text-muted">Publisher: {storeInfo.publishers.join(', ')}</p>
                  )}
              </div>
            )}

            <button
              onClick={() => launchOrInstall(selectedGame, setMessage)}
              className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-accent-gradient px-6 py-4 text-lg font-semibold text-white shadow-focus"
            >
              {selectedGame.installed ? (
                <>
                  <Play className="h-5 w-5" fill="currentColor" /> Play
                </>
              ) : (
                <>
                  <Download className="h-5 w-5" /> Install
                </>
              )}
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
