import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGamepadNav } from './input/useGamepadNav'
import { useKeyboardNav } from './input/useKeyboardNav'
import { useNavigationStore, type ScreenId } from './state/navigationStore'
import { useThemeStore } from './state/themeStore'
import { HomeMenu } from './screens/HomeMenu'
import { GamesScreen } from './screens/GamesScreen'
import { TvScreen } from './screens/TvScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { PlaceholderScreen } from './screens/PlaceholderScreen'

function renderScreen(screen: ScreenId): JSX.Element {
  switch (screen) {
    case 'games':
      return <GamesScreen />
    case 'tv':
      return <TvScreen />
    case 'settings':
      return <SettingsScreen />
    case 'browse':
      return (
        <PlaceholderScreen
          title="Browse"
          subtitle="A controller-friendly web browser lands here in a later phase."
        />
      )
    default:
      return <HomeMenu />
  }
}

function App(): JSX.Element {
  useGamepadNav()
  useKeyboardNav()
  const screen = useNavigationStore((s) => s.screen)
  const initTheme = useThemeStore((s) => s.init)

  useEffect(() => {
    void initTheme()
  }, [initTheme])

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={screen}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22, ease: 'easeInOut' }}
        className="h-screen w-screen"
      >
        {renderScreen(screen)}
      </motion.div>
    </AnimatePresence>
  )
}

export default App
