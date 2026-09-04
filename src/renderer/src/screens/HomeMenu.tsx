import { useState } from 'react'
import { motion } from 'framer-motion'
import { FocusableCard } from '../components/FocusableCard'
import { Clock } from '../components/Clock'
import { useNavListener } from '../input/useNavListener'
import { useNavigationStore, type ScreenId } from '../state/navigationStore'

const TILES: Array<{ id: ScreenId; title: string; subtitle: string }> = [
  { id: 'games', title: 'Games', subtitle: 'Steam library' },
  { id: 'tv', title: 'TV', subtitle: 'YouTube, Stremio & streaming' },
  { id: 'browse', title: 'Browse', subtitle: 'Web browser' },
  { id: 'settings', title: 'Settings', subtitle: 'Accounts & addons' }
]

export function HomeMenu(): JSX.Element {
  const [index, setIndex] = useState(0)
  const goTo = useNavigationStore((s) => s.goTo)

  useNavListener((action) => {
    switch (action) {
      case 'left':
        setIndex((i) => Math.max(0, i - 1))
        break
      case 'right':
        setIndex((i) => Math.min(TILES.length - 1, i + 1))
        break
      case 'confirm':
        goTo(TILES[index].id)
        break
      default:
        break
    }
  })

  return (
    <div className="flex h-screen flex-col gap-8 px-10 py-8">
      <header className="flex items-center justify-between">
        <h1 className="bg-accent-gradient bg-clip-text text-3xl font-bold tracking-tight text-transparent">
          TV Launcher
        </h1>
        <Clock />
      </header>
      <div className="grid flex-1 grid-cols-4 items-center gap-8">
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
              focused={index === i}
              onClick={() => {
                setIndex(i)
                goTo(tile.id)
              }}
            />
          </motion.div>
        ))}
      </div>
    </div>
  )
}
