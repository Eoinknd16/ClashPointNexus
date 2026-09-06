import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FocusableCard } from '../components/FocusableCard'
import { Clock } from '../components/Clock'
import { useNavListener } from '../input/useNavListener'
import { useNavigationStore, type ScreenId } from '../state/navigationStore'
import { useThemeStore } from '../state/themeStore'
import type { ContinueSuggestion } from '@shared/homeTypes'
import type { WeatherData } from '@shared/weatherTypes'
import type { SystemStats } from '@shared/systemTypes'

// Each tile gets its own explicit two-color identity (FocusableCard's
// iconColors override) instead of every tile deriving from the same theme
// accent color — the latter is what made every tile look like the same flat
// brown/orange blob regardless of theme, per a real screenshot.
const TILES: Array<{
  id: ScreenId
  title: string
  subtitle: string
  icon: string
  iconColors: [string, string]
}> = [
  { id: 'games', title: 'Games', subtitle: 'Steam library', icon: '🎮', iconColors: ['#1e3a8a', '#7c3aed'] },
  {
    id: 'tv',
    title: 'TV',
    subtitle: 'YouTube, Stremio & streaming',
    icon: '🎬',
    iconColors: ['#7f1d1d', '#c2410c']
  },
  { id: 'browse', title: 'Browse', subtitle: 'Web browser', icon: '🌐', iconColors: ['#0e7490', '#2563eb'] },
  { id: 'files', title: 'Files', subtitle: 'This PC', icon: '🗂️', iconColors: ['#b45309', '#1e40af'] },
  { id: 'apps', title: 'Apps', subtitle: 'Launch anything', icon: '📦', iconColors: ['#6d28d9', '#db2777'] },
  {
    id: 'arcade',
    title: 'Arcade',
    subtitle: 'Nexus Dash · High Scores',
    icon: '🕹️',
    iconColors: ['#a21caf', '#0891b2']
  }
  // Settings deliberately not a tile here anymore — it's already reachable
  // from the top nav, and having it twice was redundant.
]

// System-wide sections, reachable from Home directly rather than only via
// the tile grid below — Library ("your stuff": owned games + movies/shows)
// and Store (discover/buy new games) are new top-level screens, distinct
// from the Games/TV tiles which stay focused on Steam/streaming specifically.
const TOP_NAV: Array<{ id: ScreenId; label: string; icon: string }> = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'library', label: 'Library', icon: '📚' },
  { id: 'store', label: 'Store', icon: '🛒' },
  { id: 'settings', label: 'Settings', icon: '⚙️' }
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

function weatherEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code === 45 || code === 48) return '🌫️'
  if (code >= 51 && code <= 67) return '🌦️'
  if (code >= 71 && code <= 77) return '🌨️'
  if (code >= 80 && code <= 82) return '🌧️'
  if (code >= 85 && code <= 86) return '🌨️'
  if (code >= 95) return '⛈️'
  return '🌡️'
}

export function HomeMenu(): JSX.Element {
  const [zone, setZone] = useState<Zone>('tiles')
  const [topNavIndex, setTopNavIndex] = useState(0)
  const [tileIndex, setTileIndex] = useState(0)
  const [continueSuggestion, setContinueSuggestion] = useState<ContinueSuggestion | null>(null)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [libraryStats, setLibraryStats] = useState<LibraryStats | null>(null)
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null)
  const goTo = useNavigationStore((s) => s.goTo)
  const allThemes = useThemeStore((s) => s.allThemes)
  const themeId = useThemeStore((s) => s.themeId)
  const activeTheme = allThemes.find((t) => t.id === themeId)

  useEffect(() => {
    window.api.home
      .getContinueSuggestion()
      .then(setContinueSuggestion)
      .catch(() => setContinueSuggestion(null))
    window.api.weather.get().then(setWeather).catch(() => setWeather(null))
    window.api.system.getStats().then(setSystemStats).catch(() => setSystemStats(null))
    Promise.all([window.api.library.list(), window.api.steam.getLibrary()])
      .then(([library, steam]) => {
        setLibraryStats({
          movies: library.filter((e) => e.type === 'movie').length,
          series: library.filter((e) => e.type === 'series').length,
          games: steam.games.length
        })
      })
      .catch(() => setLibraryStats(null))
  }, [])

  function activateContinue(suggestion: ContinueSuggestion): void {
    if (suggestion.kind === 'game') {
      goTo('games', { kind: 'game', game: suggestion.game })
    } else {
      goTo('tv', { kind: 'tv', tab: suggestion.tab, item: suggestion.item })
    }
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
        setTileIndex((i) => Math.min(TILES.length - 1, i + 1))
        return
      case 'confirm':
        goTo(TILES[tileIndex].id)
        return
      default:
        return
    }
  }, 'home')

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
        <div />
        <nav className="flex justify-self-center gap-1 rounded-full bg-surface/70 p-1.5 ring-1 ring-white/10 backdrop-blur-md">
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
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>

        <div className="flex items-center justify-self-end gap-4">
          {weather && (
            <div className="flex items-center gap-2 rounded-full bg-surface/70 px-4 py-2 backdrop-blur-md">
              <span className="text-lg">{weatherEmoji(weather.weatherCode)}</span>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">{Math.round(weather.tempCelsius)}°C</span>
                {weather.city && <span className="text-xs text-muted">{weather.city}</span>}
              </div>
            </div>
          )}
          <Clock />
          <div
            onClick={() => goTo('settings')}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-surface/70 text-lg backdrop-blur-md"
          >
            👤
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
            className={`absolute bottom-6 left-6 flex w-[26rem] max-w-[80%] cursor-pointer items-center gap-4 rounded-2xl bg-black/40 p-4 shadow-lg ring-1 ring-white/15 backdrop-blur-md transition-shadow ${
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
              <span className="text-3xl">▶️</span>
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
            <span className="shrink-0 text-2xl">▶</span>
          </div>
        )}

        <div className="absolute right-6 top-6 flex flex-col gap-3">
          {weather && (
            <div className="flex w-52 items-center gap-3 rounded-xl bg-black/40 px-4 py-3 shadow-lg ring-1 ring-white/15 backdrop-blur-md">
              <span className="text-2xl">{weatherEmoji(weather.weatherCode)}</span>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">{Math.round(weather.tempCelsius)}°C</span>
                {weather.city && <span className="text-xs text-muted">{weather.city}</span>}
              </div>
            </div>
          )}
          {libraryStats && (
            <div className="flex w-52 items-center gap-3 rounded-xl bg-black/40 px-4 py-3 shadow-lg ring-1 ring-white/15 backdrop-blur-md">
              <span className="text-2xl">🎮</span>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">{libraryStats.games}</span>
                <span className="text-xs text-muted">Active Games</span>
              </div>
            </div>
          )}
          {systemStats && (
            <div className="flex w-52 flex-col gap-2 rounded-xl bg-black/40 px-4 py-3 shadow-lg ring-1 ring-white/15 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">CPU</span>
                <span className="font-semibold">
                  {systemStats.cpuLoadPercent !== null ? `${systemStats.cpuLoadPercent}%` : '—'}
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
        <div className="grid grid-cols-6 gap-6">
          {TILES.map((tile, i) => (
            <motion.div
              key={tile.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06, ease: 'easeOut' }}
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
                  goTo(tile.id)
                }}
              />
            </motion.div>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 justify-center gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${i === 0 ? 'w-6 bg-accent' : 'w-1.5 bg-white/20'}`}
          />
        ))}
      </div>

      <div className="pointer-events-none fixed bottom-6 right-8 flex items-center gap-4 text-xs text-muted">
        <span>🎮 Select</span>
        <span>☰ Menu</span>
      </div>
    </div>
  )
}
