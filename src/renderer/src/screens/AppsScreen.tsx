import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Package2, Play, Star, X } from 'lucide-react'
import { CardArt, FocusableCard, type CardItem } from '../components/FocusableCard'
import { useNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'
import { useNavigationStore } from '../state/navigationStore'
import type { AppEntry } from '@shared/appsTypes'

const COLUMNS = 5
type Zone = 'grid' | 'detail'

function toCardItem(entry: AppEntry): CardItem {
  return {
    id: entry.id,
    title: entry.name,
    subtitle: entry.args || undefined,
    icon: Package2,
    gradientDirection: 'bg-gradient-to-br',
    favorite: entry.favorite
  }
}

export function AppsScreen(): JSX.Element {
  const [apps, setApps] = useState<AppEntry[]>([])
  const [zone, setZone] = useState<Zone>('grid')
  const [gridIndex, setGridIndex] = useState(0)
  const [selectedApp, setSelectedApp] = useState<AppEntry | null>(null)
  const message = useStatusStore((s) => s.message)
  const setMessage = useStatusStore((s) => s.setMessage)
  const goHome = useNavigationStore((s) => s.goHome)
  const cardRefs = useRef<Array<HTMLDivElement | null>>([])

  function reload(): void {
    window.api.apps
      .list()
      .then(setApps)
      .catch(() => setMessage("Couldn't load the app list"))
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (zone !== 'grid') return
    cardRefs.current[gridIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, gridIndex])

  const cards = apps.map(toCardItem)

  function launch(entry: AppEntry): void {
    setMessage(`Launching ${entry.name}...`)
    window.api.apps
      .launch(entry.executablePath, entry.args)
      .then((error) => {
        setMessage(error ? `Couldn't launch ${entry.name}: ${error}` : `Launched ${entry.name}`)
      })
      .catch((error) => {
        setMessage(`Couldn't launch ${entry.name}: ${error instanceof Error ? error.message : String(error)}`)
      })
  }

  function toggleFavorite(entry: AppEntry | null): void {
    if (!entry) return
    const nextFavorite = !entry.favorite
    setApps((prev) => prev.map((a) => (a.id === entry.id ? { ...a, favorite: nextFavorite } : a)))
    setSelectedApp((prev) => (prev && prev.id === entry.id ? { ...prev, favorite: nextFavorite } : prev))
    window.api.apps.toggleFavorite(entry.id).catch(() => {
      setApps((prev) => prev.map((a) => (a.id === entry.id ? { ...a, favorite: entry.favorite } : a)))
      setSelectedApp((prev) => (prev && prev.id === entry.id ? { ...prev, favorite: entry.favorite } : prev))
      setMessage(`Couldn't save favorite for ${entry.name}`)
    })
  }

  function removeApp(entry: AppEntry | null): void {
    if (!entry) return
    setSelectedApp(null)
    setZone('grid')
    setApps((prev) => prev.filter((a) => a.id !== entry.id))
    window.api.apps
      .remove(entry.id)
      .then(() => setMessage(`Removed ${entry.name}`))
      .catch(() => {
        setMessage(`Couldn't remove ${entry.name}`)
        reload()
      })
  }

  useNavListener((action) => {
    if (zone === 'detail') {
      switch (action) {
        case 'confirm':
          if (selectedApp) launch(selectedApp)
          return
        case 'toggleSubtitles':
          toggleFavorite(selectedApp)
          return
        case 'skipNext':
          removeApp(selectedApp)
          return
        case 'back':
        case 'menu':
          setSelectedApp(null)
          setZone('grid')
          return
        default:
          return
      }
    }

    // zone === 'grid'
    switch (action) {
      case 'up':
        setGridIndex((i) => Math.max(0, i - COLUMNS))
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
      case 'toggleSubtitles':
        toggleFavorite(apps[gridIndex])
        return
      case 'confirm': {
        const entry = apps[gridIndex]
        if (!entry) return
        setSelectedApp(entry)
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
  }, 'apps')

  const selectedCard = selectedApp ? toCardItem(selectedApp) : null

  return (
    <div className="relative flex h-screen bg-bg">
      <motion.div layout className="flex flex-1 flex-col gap-6 overflow-hidden px-10 py-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Apps</h1>
          <p className="text-sm text-muted">
            Add an app: browse to its .exe in Files, click the left stick, then "Add to App Launcher".
          </p>
        </header>

        <div className="grid flex-1 auto-rows-min grid-cols-5 gap-10 overflow-y-auto p-5">
          {cards.length === 0 && <span className="text-muted">No apps registered yet.</span>}
          {cards.map((card, i) => (
            <div key={card.id} ref={(el) => (cardRefs.current[i] = el)} className="scroll-m-10">
              <FocusableCard
                item={card}
                focused={zone === 'grid' && gridIndex === i}
                onClick={() => {
                  setGridIndex(i)
                  setSelectedApp(apps[i])
                  setZone('detail')
                }}
              />
            </div>
          ))}
        </div>

        <footer className="text-sm text-muted">{message}</footer>
      </motion.div>

      <AnimatePresence mode="popLayout">
        {selectedApp && selectedCard && (
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

            <div className="flex items-start justify-between gap-3">
              <h2 className="text-2xl font-bold leading-tight">{selectedApp.name}</h2>
              <button
                onClick={() => toggleFavorite(selectedApp)}
                title={selectedApp.favorite ? 'Remove favorite' : 'Add favorite (Square)'}
                className={`shrink-0 transition-opacity ${
                  selectedApp.favorite ? 'opacity-100' : 'opacity-30 hover:opacity-70'
                }`}
              >
                <Star className="h-6 w-6 text-yellow-400" fill="currentColor" />
              </button>
            </div>
            <p className="-mt-4 truncate text-sm text-muted">{selectedApp.executablePath}</p>

            <button
              onClick={() => launch(selectedApp)}
              className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-accent-gradient px-6 py-4 text-lg font-semibold text-white shadow-focus"
            >
              <Play className="h-5 w-5" fill="currentColor" /> Launch
            </button>
            <button
              onClick={() => removeApp(selectedApp)}
              className="flex items-center justify-center gap-2 rounded-xl bg-surface-hi px-6 py-3 text-sm font-medium text-muted hover:text-white"
            >
              <X className="h-4 w-4" /> Remove (Share)
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
