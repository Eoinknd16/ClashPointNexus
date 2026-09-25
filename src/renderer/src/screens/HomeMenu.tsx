import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpen,
  Circle,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  FolderOpen,
  Film,
  Gamepad2,
  Globe,
  Home,
  Joystick,
  Menu,
  Monitor,
  Package2,
  Play,
  Settings as SettingsIcon,
  ShoppingCart,
  Sun,
  Thermometer,
  User,
  type LucideIcon
} from 'lucide-react'
import { FocusableCard } from '../components/FocusableCard'
import { Clock } from '../components/Clock'
import { useNavListener } from '../input/useNavListener'
import { useNavigationStore, type ScreenId } from '../state/navigationStore'
import { useThemeStore } from '../state/themeStore'
import type { ContinueSuggestion } from '@shared/homeTypes'
import type { WeatherData } from '@shared/weatherTypes'
import type { SystemStats } from '@shared/systemTypes'

// Matches the tile grid's own grid-cols-6 below — a "page" is exactly one
// full row, so this is the single source of truth both the grid and the
// pagination math derive from.
const TILES_PER_PAGE = 6

// Each tile gets its own explicit two-color identity (FocusableCard's
// iconColors override) instead of every tile deriving from the same theme
// accent color — the latter is what made every tile look like the same flat
// brown/orange blob regardless of theme, per a real screenshot.
//
// Most tiles navigate to a real screen (`screen`); "Desktop" instead runs an
// action (minimize Nexus, same as the physical Show Desktop combo/Quick Menu
// entry) — it has no `screen` of its own, so activation checks for `action`
// first.
const TILES: Array<{
  id: string
  title: string
  subtitle: string
  icon: LucideIcon
  iconColors: [string, string]
  screen?: ScreenId
  action?: () => void
}> = [
  {
    id: 'games',
    title: 'Games',
    subtitle: 'Steam library',
    icon: Gamepad2,
    iconColors: ['#1e3a8a', '#7c3aed'],
    screen: 'games'
  },
  {
    id: 'tv',
    title: 'TV',
    subtitle: 'YouTube, Stremio & streaming',
    icon: Film,
    iconColors: ['#7f1d1d', '#c2410c'],
    screen: 'tv'
  },
  {
    id: 'browse',
    title: 'Browse',
    subtitle: 'Web browser',
    icon: Globe,
    iconColors: ['#0e7490', '#2563eb'],
    screen: 'browse'
  },
  {
    id: 'files',
    title: 'Files',
    subtitle: 'This PC',
    icon: FolderOpen,
    iconColors: ['#b45309', '#1e40af'],
    screen: 'files'
  },
  {
    id: 'apps',
    title: 'Apps',
    subtitle: 'Launch anything',
    icon: Package2,
    iconColors: ['#6d28d9', '#db2777'],
    screen: 'apps'
  },
  {
    id: 'desktop',
    title: 'Desktop',
    subtitle: 'Minimize & show Windows',
    icon: Monitor,
    iconColors: ['#334155', '#0f172a'],
    action: () => void window.api.globalInput.goToDesktop()
  }
  // Settings deliberately not a tile here anymore — it's already reachable
  // from the top nav, and having it twice was redundant.
]

// Arcade doesn't ship with Nexus — it's an optional plugin (see
// main/plugins/trustedPlugins.ts), so unlike every tile above it only
// appears once it's actually installed (checked below), appended after the
// built-in tiles rather than interleaved — the same "additive, never a
// hardcoded slot" rule every other installed-plugin surface already
// follows (AppsScreen, GamesScreen).
const ARCADE_TILE: (typeof TILES)[number] = {
  id: 'arcade',
  title: 'Arcade',
  subtitle: 'Emulated games',
  icon: Joystick,
  iconColors: ['#0f766e', '#4338ca'],
  action: () => useNavigationStore.getState().goTo('arcade')
}

// System-wide sections, reachable from Home directly rather than only via
// the tile grid below — Library ("your stuff": owned games + movies/shows)
// and Store (discover/buy new games) are new top-level screens, distinct
// from the Games/TV tiles which stay focused on Steam/streaming specifically.
const TOP_NAV: Array<{ id: ScreenId; label: string; icon: LucideIcon }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'library', label: 'Library', icon: BookOpen },
  { id: 'store', label: 'Store', icon: ShoppingCart },
  { id: 'settings', label: 'Settings', icon: SettingsIcon }
]

interface LibraryStats {
  movies: number
  series: number
  games: number
}

// Three stacked zones, top to bottom — Up/Down move between them, Left/Right
// move within whichever is active. Hero only exists as a stop when there's
// an actual Continue card to land on.
type Zone = 'topnav' | 'hero' | 'tiles'

// TEMPORARY diagnostic (remove once the cold-boot Home lag report is
// actually root-caused): module scope survives Home's own unmount/remount
// since HomeMenu the module is only ever imported once, so this tells the
// perf log below whether a given mount is the app's very first Home paint
// this session or a later one — the reported symptom is specifically "laggy
// right when the app opens, fine after visiting a page and coming back",
// which only a first-vs-later comparison can actually confirm or rule out.
let homeMountCount = 0

function weatherIcon(code: number): LucideIcon {
  if (code === 0) return Sun
  if (code <= 3) return CloudSun
  if (code === 45 || code === 48) return CloudFog
  if (code >= 51 && code <= 67) return CloudDrizzle
  if (code >= 71 && code <= 77) return CloudSnow
  if (code >= 80 && code <= 82) return CloudRain
  if (code >= 85 && code <= 86) return CloudSnow
  if (code >= 95) return CloudLightning
  return Thermometer
}

export function HomeMenu(): JSX.Element {
  const [zone, setZone] = useState<Zone>('tiles')
  const [topNavIndex, setTopNavIndex] = useState(0)
  const [tileIndex, setTileIndex] = useState(0)
  const [continueSuggestion, setContinueSuggestion] = useState<ContinueSuggestion | null>(null)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [libraryStats, setLibraryStats] = useState<LibraryStats | null>(null)
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null)
  const [arcadeInstalled, setArcadeInstalled] = useState(false)
  const goTo = useNavigationStore((s) => s.goTo)
  const allThemes = useThemeStore((s) => s.allThemes)
  const themeId = useThemeStore((s) => s.themeId)
  const activeTheme = allThemes.find((t) => t.id === themeId)

  useEffect(() => {
    // TEMPORARY diagnostic — see homeMountCount's own comment above. Times
    // each of Home's mount-time fetches and reports one consolidated line
    // to the persistent log (reusing logging.reportError purely as a "write
    // to nexus.log" pipe — this does not raise the on-screen CrashToast,
    // which is driven separately by crashLogStore, not by this IPC call) so
    // a real "which of these is actually slow on a cold boot" answer can be
    // read back after a real repro, instead of guessing again.
    homeMountCount += 1
    const isFirstMount = homeMountCount === 1
    const t0 = performance.now()
    const timings: Record<string, number> = {}
    const mark = (label: string): void => {
      timings[label] = Math.round(performance.now() - t0)
    }
    const reportTimings = (): void => {
      const line = Object.entries(timings)
        .map(([label, ms]) => `${label}=${ms}ms`)
        .join(' ')
      void window.api.logging
        .reportError(`[perf] Home ${isFirstMount ? 'FIRST mount' : 'remount'} fetch timings: ${line}`)
        .catch(() => {})
    }

    window.api.home
      .getContinueSuggestion()
      .then(setContinueSuggestion)
      .catch(() => setContinueSuggestion(null))
      .finally(() => mark('continueSuggestion'))
    window.api.weather
      .get()
      .then(setWeather)
      .catch(() => setWeather(null))
      .finally(() => mark('weather'))
    window.api.system
      .getStats()
      .then(setSystemStats)
      .catch(() => setSystemStats(null))
      .finally(() => mark('systemStats'))
    Promise.all([window.api.library.list(), window.api.steam.getLibrary()])
      .then(([library, steam]) => {
        setLibraryStats({
          movies: library.filter((e) => e.type === 'movie').length,
          series: library.filter((e) => e.type === 'series').length,
          games: steam.games.length
        })
      })
      .catch(() => setLibraryStats(null))
      .finally(() => mark('libraryAndSteam'))
    // Arcade doesn't ship with Nexus — see ARCADE_TILE's own doc comment —
    // so whether its tile shows up at all comes from the same installed-
    // plugins check every other plugin surface already makes.
    const arcadeCheck = window.api.plugins
      .listInstalled()
      .then((installed) => setArcadeInstalled(installed.some((p) => p.manifest.id === 'arcade')))
      .catch(() => setArcadeInstalled(false))
      .finally(() => mark('arcadeInstalled'))

    void arcadeCheck.finally(() => {
      // All five fire in parallel above — whichever actually resolves last
      // is arcadeCheck's own .finally, since every other one's mark() call
      // already ran by the time any single promise can be the slowest. Not
      // rigorous (a fetch could theoretically still be in flight if it's
      // slower than arcadeInstalled specifically) but good enough for a
      // one-shot diagnostic reading real numbers off one real machine.
      setTimeout(reportTimings, 50)
    })
  }, [])

  useEffect(() => {
    // TEMPORARY diagnostic — see homeMountCount's own comment above.
    // longtask entries are Chromium's own signal for "something blocked the
    // main thread for 50ms+", which is exactly what dropped/janky D-pad
    // navigation frames would show up as — this catches it directly instead
    // of guessing which CSS/paint/re-render cost is responsible. Windowed to
    // the 8s right after Home mounts, which comfortably covers "laggy right
    // when the app opens" without leaving this running for the whole session.
    const isFirstMount = homeMountCount === 1
    const mountedAt = performance.now()
    const longTasks: string[] = []
    let observer: PerformanceObserver | null = null
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push(`${Math.round(entry.startTime - mountedAt)}ms+${Math.round(entry.duration)}ms`)
        }
      })
      observer.observe({ entryTypes: ['longtask'] })
    } catch {
      // longtask not supported in this Chromium build — nothing to observe
    }
    const timer = setTimeout(() => {
      observer?.disconnect()
      const summary = longTasks.length > 0 ? longTasks.join(', ') : '(none)'
      void window.api.logging
        .reportError(`[perf] Home ${isFirstMount ? 'FIRST mount' : 'remount'} long tasks in first 8s: ${summary}`)
        .catch(() => {})
    }, 8000)
    return () => {
      clearTimeout(timer)
      observer?.disconnect()
    }
  }, [])

  const tiles = arcadeInstalled ? [...TILES, ARCADE_TILE] : TILES
  const pageCount = Math.max(1, Math.ceil(tiles.length / TILES_PER_PAGE))
  const currentPage = Math.min(pageCount - 1, Math.floor(tileIndex / TILES_PER_PAGE))

  function activateContinue(suggestion: ContinueSuggestion): void {
    if (suggestion.kind === 'game') {
      goTo('games', { kind: 'game', game: suggestion.game })
    } else {
      goTo('tv', { kind: 'tv', tab: suggestion.tab, item: suggestion.item })
    }
  }

  function activateTile(tile: (typeof TILES)[number]): void {
    if (tile.action) tile.action()
    else if (tile.screen) goTo(tile.screen)
  }

  useNavListener((action) => {
    if (zone === 'topnav') {
      switch (action) {
        case 'left':
          setTopNavIndex((i) => Math.max(0, i - 1))
          return
        case 'right':
          setTopNavIndex((i) => Math.min(TOP_NAV.length - 1, i + 1))
          return
        case 'down':
          setZone(continueSuggestion ? 'hero' : 'tiles')
          return
        case 'confirm':
          goTo(TOP_NAV[topNavIndex].id)
          return
        case 'back':
        case 'menu':
          setZone('tiles')
          return
        default:
          return
      }
    }

    if (zone === 'hero') {
      switch (action) {
        case 'up':
          setZone('topnav')
          return
        case 'down':
          setZone('tiles')
          return
        case 'confirm':
          if (continueSuggestion) activateContinue(continueSuggestion)
          return
        case 'back':
        case 'menu':
          setZone('tiles')
          return
        default:
          return
      }
    }

    // zone === 'tiles'
    switch (action) {
      case 'up':
        setZone(continueSuggestion ? 'hero' : 'topnav')
        return
      case 'left':
        setTileIndex((i) => Math.max(0, i - 1))
        return
      case 'right':
        setTileIndex((i) => Math.min(tiles.length - 1, i + 1))
        return
      case 'confirm':
        activateTile(tiles[tileIndex])
        return
      default:
        return
    }
  }, 'home')

  const WeatherIcon = weather ? weatherIcon(weather.weatherCode) : null

  return (
    <div className="relative flex h-screen flex-col gap-5 overflow-hidden px-10 py-6">
      {/* Full-bleed background — behind the top nav and the Your Apps row
          too, not just the hero content, so the image reads as the actual
          page background rather than a bordered "card" floating on top of
          a differently-colored page. Fades to the theme's flat --color-bg
          by the time it reaches the Apps row, and darkens slightly at the
          very top for the nav/clock text to stay legible over whatever's
          behind it. */}
      <div className="absolute inset-0 -z-10">
        {activeTheme?.heroImage ? (
          // A real image from an installed theme pack (Settings > pick a
          // theme, installed via File Manager's "Install as Theme") —
          // always preferred over the CSS/SVG fallback below when present.
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url("${activeTheme.heroImage}")` }}
          />
        ) : (
          <>
            {/* No installed theme pack image, and no other legitimate source
                of real photography (extracting one from a flattened mockup
                screenshot produces garbage; hotlinking a stock photo from an
                unknown source isn't happening) — a CSS/SVG dusk-over-
                mountains scene instead of a flat gradient: a sky gradient, a
                soft sun/moon glow near the horizon, and two layered mountain
                silhouettes for actual depth. */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, #14142e 0%, #322a52 22%, #6b3a5c 42%, #b6524f 60%, #dd8656 76%, #eeb374 100%)'
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(circle 380px at 72% 66%, rgba(255,224,170,0.85), transparent 70%)'
              }}
            />
            <svg
              className="absolute inset-x-0 bottom-0 h-[55%] w-full"
              viewBox="0 0 100 40"
              preserveAspectRatio="none"
            >
              <polygon
                points="0,40 0,20 12,8 22,16 34,4 48,14 60,6 74,15 88,5 100,13 100,40"
                fill="rgba(18,14,32,0.55)"
              />
            </svg>
            <svg
              className="absolute inset-x-0 bottom-0 h-[38%] w-full"
              viewBox="0 0 100 30"
              preserveAspectRatio="none"
            >
              <polygon
                points="0,30 0,18 15,10 28,17 40,7 55,16 68,9 82,17 100,11 100,30"
                fill="rgba(9,7,18,0.9)"
              />
            </svg>
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-transparent" />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, transparent 0%, transparent 48%, rgb(var(--color-bg)) 86%)'
          }}
        />
      </div>

      <header className="grid shrink-0 grid-cols-3 items-center">
        <h1 className="justify-self-start text-xl font-bold tracking-tight">
          ClashPoint <span className="text-accent">Nexus</span>
        </h1>
        {/* No backdrop-blur on any panel in this header/hero area — see
            FocusableCard's own chevron badge comment for why: it's one of
            the most expensive things a browser can composite, and Home
            stacks this many panels over an animated gradient background at
            once. A flat, more opaque fill reads almost identically without
            forcing a real-time blur sample behind every one of them on
            every repaint, which is what made D-pad tile navigation laggy
            on this screen specifically (and only this screen — no other
            screen stacks panels like this). */}
        <nav className="flex justify-self-center gap-1 rounded-full bg-surface/90 p-1.5 ring-1 ring-white/10">
          {TOP_NAV.map((item, i) => (
            <div
              key={item.id}
              onClick={() => {
                setZone('topnav')
                setTopNavIndex(i)
                goTo(item.id)
              }}
              className={`flex cursor-pointer items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                item.id === 'home' ? 'bg-accent text-white' : 'text-muted hover:text-white'
              } ${
                zone === 'topnav' && topNavIndex === i
                  ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg'
                  : ''
              }`}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </div>
          ))}
        </nav>

        <div className="flex items-center justify-self-end gap-4">
          {weather && WeatherIcon && (
            <div className="flex items-center gap-2 rounded-full bg-surface/90 px-4 py-2">
              <WeatherIcon className="h-5 w-5" />
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">{Math.round(weather.tempCelsius)}°C</span>
                {weather.city && <span className="text-xs text-muted">{weather.city}</span>}
              </div>
            </div>
          )}
          <Clock />
          <div
            onClick={() => goTo('settings')}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-surface/90"
          >
            <User className="h-5 w-5" />
          </div>
        </div>
      </header>

      <div className="relative min-h-[220px] flex-1">
        {continueSuggestion && (
          <div
            onClick={() => {
              setZone('hero')
              activateContinue(continueSuggestion)
            }}
            className={`absolute bottom-6 left-6 flex w-[26rem] max-w-[80%] cursor-pointer items-center gap-4 rounded-panel bg-black/65 p-4 shadow-lg ring-1 ring-white/15 transition-shadow ${
              zone === 'hero' ? 'shadow-focus ring-2 ring-accent' : ''
            }`}
          >
            {continueSuggestion.poster ? (
              <img
                src={continueSuggestion.poster}
                alt=""
                className="h-16 w-16 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <Play className="h-8 w-8 shrink-0" />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-lg font-semibold">{continueSuggestion.title}</span>
              <span className="truncate text-sm text-accent">{continueSuggestion.subtitle}</span>
              {continueSuggestion.progressPercent !== null && (
                <div className="mt-1 h-1.5 w-full rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-accent-gradient"
                    style={{ width: `${continueSuggestion.progressPercent}%` }}
                  />
                </div>
              )}
            </div>
            <Play className="h-6 w-6 shrink-0" fill="currentColor" />
          </div>
        )}

        <div className="absolute right-6 top-6 flex flex-col gap-3">
          {weather && WeatherIcon && (
            <div className="flex w-52 items-center gap-3 rounded-panel bg-black/65 px-4 py-3 shadow-lg ring-1 ring-white/15">
              <WeatherIcon className="h-7 w-7" />
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">{Math.round(weather.tempCelsius)}°C</span>
                {weather.city && <span className="text-xs text-muted">{weather.city}</span>}
              </div>
            </div>
          )}
          {libraryStats && (
            <div className="flex w-52 items-center gap-3 rounded-panel bg-black/65 px-4 py-3 shadow-lg ring-1 ring-white/15">
              <Gamepad2 className="h-7 w-7" />
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">{libraryStats.games}</span>
                <span className="text-xs text-muted">Active Games</span>
              </div>
            </div>
          )}
          {systemStats && (
            <div className="flex w-52 flex-col gap-2 rounded-panel bg-black/65 px-4 py-3 shadow-lg ring-1 ring-white/15">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">CPU</span>
                <span className="font-semibold">
                  {systemStats.cpuLoadPercent !== null ? `${systemStats.cpuLoadPercent}%` : '--'}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-accent-gradient"
                  style={{ width: `${systemStats.cpuLoadPercent ?? 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">RAM</span>
                <span className="font-semibold">{systemStats.usedMemPercent}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-accent-gradient"
                  style={{ width: `${systemStats.usedMemPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0">
        <h2 className="mb-3 text-lg font-semibold">Your Apps</h2>
        {/* One page per full row (TILES_PER_PAGE) — overflow-hidden here is
            the carousel viewport; the flex track below it is left at its
            natural width (fits the viewport) with each page pinned to
            w-full/shrink-0, so its content overflows visually and gets
            clipped only by this wrapper, not by anything closer to the
            tiles themselves. Horizontal padding is reserved the same way
            the vertical padding already is (--tile-grow-pad, scaled to the
            live theme's card-size/focus-scale/lift settings) so a focused
            tile's glow at the left/right edge of a page never gets cut off
            by this same wrapper it needs for the slide. */}
        <div className="overflow-hidden">
          <motion.div
            className="flex"
            animate={{ x: `-${currentPage * 100}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
          >
            {Array.from({ length: pageCount }, (_, page) => (
              <div
                key={page}
                className="grid w-full shrink-0 grid-cols-6 gap-[max(var(--space-grid-gap),var(--tile-grow-pad))] px-[var(--tile-grow-pad)] py-[var(--tile-grow-pad)]"
              >
                {tiles.slice(page * TILES_PER_PAGE, page * TILES_PER_PAGE + TILES_PER_PAGE).map((tile, iInPage) => {
                  const i = page * TILES_PER_PAGE + iInPage
                  return (
                    <motion.div
                      key={tile.id}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: iInPage * 0.06, ease: 'easeOut' }}
                    >
                      <FocusableCard
                        size="large"
                        showChevron
                        item={{
                          id: tile.id,
                          title: tile.title,
                          subtitle: tile.subtitle,
                          icon: tile.icon,
                          imageUrl: activeTheme?.tileImages?.[tile.id],
                          iconColors: tile.iconColors
                        }}
                        focused={zone === 'tiles' && tileIndex === i}
                        onClick={() => {
                          setZone('tiles')
                          setTileIndex(i)
                          activateTile(tile)
                        }}
                      />
                    </motion.div>
                  )
                })}
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {pageCount > 1 && (
        <div className="flex shrink-0 justify-center gap-2">
          {Array.from({ length: pageCount }, (_, i) => (
            // -m-2/p-2 is a bigger click/touch target than the visible dot
            // itself without changing the row's visual spacing — matters
            // for mouse/touch input (remote desktop, a trackpad), not just
            // controller, since dots have no D-pad stop of their own.
            <div
              key={i}
              onClick={() => {
                setZone('tiles')
                setTileIndex(i * TILES_PER_PAGE)
              }}
              className="-m-2 cursor-pointer p-2"
            >
              <span
                className={`block h-1.5 rounded-full transition-all ${
                  i === currentPage ? 'w-6 bg-accent' : 'w-1.5 bg-white/20'
                }`}
              />
            </div>
          ))}
        </div>
      )}

      <div className="pointer-events-none fixed bottom-6 right-8 flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <Circle className="h-3.5 w-3.5" /> Select
        </span>
        <span className="flex items-center gap-1.5">
          <Menu className="h-3.5 w-3.5" /> Menu
        </span>
      </div>
    </div>
  )
}
