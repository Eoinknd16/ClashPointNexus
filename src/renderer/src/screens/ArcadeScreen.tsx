import { useState } from 'react'
import { Joystick } from 'lucide-react'
import { FocusableCard } from '../components/FocusableCard'
import { useNavListener } from '../input/useNavListener'
import { useNavigationStore } from '../state/navigationStore'
import { NexusDashGame } from './NexusDashGame'

interface ArcadeGame {
  id: string
  title: string
  subtitle: string
  iconColors: [string, string]
}

// One entry per playable thing on this screen — built-in games today, and
// per a direct request, this is also where emulators or anything else get
// their own tile down the line, rather than this screen only ever being
// able to be the one game it originally shipped with.
const GAMES: ArcadeGame[] = [
  {
    id: 'nexusDash',
    title: 'Nexus Dash',
    subtitle: 'Dodge & Collect · High Scores',
    iconColors: ['#a21caf', '#0891b2']
  }
]

type View = 'hub' | 'nexusDash'

/**
 * Arcade's own landing page — same "pick a tile, drop into its own view"
 * shape as Home/Store, rather than jumping straight into Nexus Dash the
 * moment you open Arcade. Nexus Dash itself is unchanged, just relocated
 * to its own component (NexusDashGame) that hands control back here
 * (onExit) instead of going straight to the OS-level Home.
 */
export function ArcadeScreen(): JSX.Element {
  const goHome = useNavigationStore((s) => s.goHome)
  const [view, setView] = useState<View>('hub')
  const [gameIndex, setGameIndex] = useState(0)

  function launchGame(id: string): void {
    if (id === 'nexusDash') setView('nexusDash')
  }

  useNavListener((action) => {
    if (view !== 'hub') return
    switch (action) {
      case 'left':
        setGameIndex((i) => Math.max(0, i - 1))
        return
      case 'right':
        setGameIndex((i) => Math.min(GAMES.length - 1, i + 1))
        return
      case 'confirm':
        launchGame(GAMES[gameIndex]?.id ?? '')
        return
      case 'back':
      case 'menu':
        goHome()
        return
      default:
        return
    }
  }, 'arcade')

  if (view === 'nexusDash') {
    return <NexusDashGame onExit={() => setView('hub')} />
  }

  return (
    <div className="flex h-screen flex-col gap-6 bg-bg px-10 py-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Arcade</h1>
        <p className="text-sm text-muted">Built-in games, and anything else you add down the line.</p>
      </header>

      <div className="grid grid-cols-7 gap-6">
        {GAMES.map((game, i) => (
          <FocusableCard
            key={game.id}
            size="large"
            showChevron
            item={{
              id: game.id,
              title: game.title,
              subtitle: game.subtitle,
              icon: Joystick,
              iconColors: game.iconColors
            }}
            focused={view === 'hub' && gameIndex === i}
            onClick={() => {
              setGameIndex(i)
              launchGame(game.id)
            }}
          />
        ))}
      </div>

      <footer className="text-sm text-muted">More games (and emulators) land here over time.</footer>
    </div>
  )
}
