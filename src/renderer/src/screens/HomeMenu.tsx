import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FocusableCard } from '../components/FocusableCard'
import { Clock } from '../components/Clock'
import { useNavListener } from '../input/useNavListener'
import { useNavigationStore, type ScreenId } from '../state/navigationStore'
import type { ContinueSuggestion } from '@shared/homeTypes'
import type { WeatherData } from '@shared/weatherTypes'

const TILES: Array<{ id: ScreenId; title: string; subtitle: string }> = [
  { id: 'games', title: 'Games', subtitle: 'Steam library' },
  { id: 'tv', title: 'TV', subtitle: 'YouTube, Stremio & streaming' },
  { id: 'browse', title: 'Browse', subtitle: 'Web browser' },
  { id: 'files', title: 'Files', subtitle: 'This PC' },
  { id: 'settings', title: 'Settings', subtitle: 'Accounts & addons' }
]

type PowerAction = 'sleep' | 'restart' | 'shutdown'
const POWER_OPTIONS: Array<{ id: PowerAction; label: string }> = [
  { id: 'sleep', label: 'Sleep' },
  { id: 'restart', label: 'Restart' },
  { id: 'shutdown', label: 'Shut Down' }
]

// Top row (Continue) is its own zone above the tile grid, the same
// filters-above-rows split used on the TV/Games screens — Up from the tile
// row reaches it, Down returns. Power is reached by extending the tile row's
// own index range by one, same trick as the search bubbles on TV/Games.
type Zone = 'top' | 'tiles' | 'power-menu' | 'power-confirm'

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
  const [tileIndex, setTileIndex] = useState(0)
  const [powerIndex, setPowerIndex] = useState(0)
  const [confirmIndex, setConfirmIndex] = useState(0)
  const [pendingPowerAction, setPendingPowerAction] = useState<PowerAction | null>(null)
  const [continueSuggestion, setContinueSuggestion] = useState<ContinueSuggestion | null>(null)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const goTo = useNavigationStore((s) => s.goTo)

  useEffect(() => {
    window.api.home.getContinueSuggestion().then(setContinueSuggestion)
    window.api.weather.get().then(setWeather)
  }, [])

  function activateContinue(suggestion: ContinueSuggestion): void {
    if (suggestion.kind === 'game') {
      goTo('games', { kind: 'game', game: suggestion.game })
    } else {
      goTo('tv', { kind: 'tv', tab: suggestion.tab, item: suggestion.item })
    }
  }

  function executePower(action: PowerAction): void {
    if (action === 'sleep') void window.api.power.sleep()
    else if (action === 'restart') void window.api.power.restart()
    else void window.api.power.shutdown()
  }

  function closePowerMenu(): void {
    setZone('tiles')
    setPowerIndex(0)
    setPendingPowerAction(null)
    setConfirmIndex(0)
  }

  function openPowerMenu(): void {
    setZone('power-menu')
    setPowerIndex(0)
  }

  useNavListener((action) => {
    if (zone === 'power-confirm') {
      switch (action) {
        case 'left':
        case 'right':
          setConfirmIndex((i) => (i === 0 ? 1 : 0))
          return
        case 'confirm':
          if (confirmIndex === 0 && pendingPowerAction) executePower(pendingPowerAction)
          closePowerMenu()
          return
        case 'back':
        case 'menu':
          setZone('power-menu')
          setPendingPowerAction(null)
          return
        default:
          return
      }
    }

    if (zone === 'power-menu') {
      switch (action) {
        case 'up':
          setPowerIndex((i) => Math.max(0, i - 1))
          return
        case 'down':
          setPowerIndex((i) => Math.min(POWER_OPTIONS.length - 1, i + 1))
          return
        case 'confirm': {
          const option = POWER_OPTIONS[powerIndex]
          if (!option) return
          if (option.id === 'sleep') {
            executePower('sleep')
            closePowerMenu()
          } else {
            setPendingPowerAction(option.id)
            setConfirmIndex(0)
            setZone('power-confirm')
          }
          return
        }
        case 'back':
        case 'menu':
          closePowerMenu()
          return
        default:
          return
      }
    }

    if (zone === 'top') {
      switch (action) {
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
        if (continueSuggestion) setZone('top')
        return
      case 'left':
        setTileIndex((i) => Math.max(0, i - 1))
        return
      case 'right':
        setTileIndex((i) => Math.min(TILES.length, i + 1))
        return
      case 'confirm':
        if (tileIndex === TILES.length) openPowerMenu()
        else goTo(TILES[tileIndex].id)
        return
      default:
        return
    }
  }, 'home')

  return (
    <div className="flex h-screen flex-col gap-6 px-10 py-8">
      <header className="flex items-center justify-between">
        <h1 className="bg-accent-gradient bg-clip-text text-3xl font-bold tracking-tight text-transparent">
          ClashPoint Nexus
        </h1>
        <Clock />
      </header>

      {(weather || continueSuggestion) && (
        <div className="flex gap-4">
          {weather && (
            <div className="flex shrink-0 items-center gap-3 rounded-xl bg-surface px-5 py-3">
              <span className="text-2xl">{weatherEmoji(weather.weatherCode)}</span>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{Math.round(weather.tempCelsius)}°C</span>
                {weather.city && <span className="text-xs text-muted">{weather.city}</span>}
              </div>
            </div>
          )}
          {continueSuggestion && (
            <div
              onClick={() => {
                setZone('top')
                activateContinue(continueSuggestion)
              }}
              className={`flex flex-1 cursor-pointer items-center gap-4 rounded-xl px-5 py-3 transition-colors ${
                zone === 'top' ? 'bg-surface-hi shadow-focus' : 'bg-surface'
              }`}
            >
              {continueSuggestion.poster && (
                <img
                  src={continueSuggestion.poster}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">{continueSuggestion.title}</span>
                <span className="truncate text-xs text-accent">{continueSuggestion.subtitle}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid flex-1 grid-cols-5 items-center gap-10">
        {TILES.map((tile, i) => (
          <motion.div
            key={tile.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: i * 0.08, ease: 'easeOut' }}
          >
            <FocusableCard
              size="large"
              item={{ id: tile.id, title: tile.title, subtitle: tile.subtitle }}
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

      <button
        onClick={() => {
          setTileIndex(TILES.length)
          openPowerMenu()
        }}
        className={`fixed bottom-8 right-8 flex h-14 w-14 items-center justify-center rounded-full text-2xl transition-colors ${
          zone === 'tiles' && tileIndex === TILES.length
            ? 'bg-accent text-white shadow-focus'
            : 'bg-surface text-muted hover:text-white'
        }`}
      >
        ⏻
      </button>

      {(zone === 'power-menu' || zone === 'power-confirm') && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="flex w-80 flex-col gap-4 rounded-2xl bg-surface p-8">
            {zone === 'power-menu' ? (
              <>
                <h2 className="text-lg font-semibold">Power</h2>
                <div className="flex flex-col gap-2">
                  {POWER_OPTIONS.map((option, i) => (
                    <div
                      key={option.id}
                      onClick={() => {
                        setPowerIndex(i)
                        if (option.id === 'sleep') {
                          executePower('sleep')
                          closePowerMenu()
                        } else {
                          setPendingPowerAction(option.id)
                          setConfirmIndex(0)
                          setZone('power-confirm')
                        }
                      }}
                      className={`cursor-pointer rounded-xl px-5 py-3 text-center font-medium transition-colors ${
                        powerIndex === i ? 'bg-accent text-white' : 'bg-surface-hi text-muted'
                      }`}
                    >
                      {option.label}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">
                  {pendingPowerAction === 'restart' ? 'Restart the PC now?' : 'Shut down the PC now?'}
                </h2>
                <div className="flex gap-3">
                  {['Yes', 'No'].map((label, i) => (
                    <div
                      key={label}
                      onClick={() => {
                        setConfirmIndex(i)
                        if (i === 0 && pendingPowerAction) executePower(pendingPowerAction)
                        closePowerMenu()
                      }}
                      className={`flex-1 cursor-pointer rounded-xl px-5 py-3 text-center font-medium transition-colors ${
                        confirmIndex === i ? 'bg-accent text-white' : 'bg-surface-hi text-muted'
                      }`}
                    >
                      {label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
