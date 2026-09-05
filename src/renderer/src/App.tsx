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
import { BrowseScreen } from './screens/BrowseScreen'
import { FileManagerScreen } from './screens/FileManagerScreen'
import { ErrorBoundary } from './components/ErrorBoundary'
import { QuickMenu } from './components/QuickMenu'
import { CrashToast } from './components/CrashToast'

function renderScreen(screen: ScreenId): JSX.Element {
  switch (screen) {
    case 'games':
      return <GamesScreen />
    case 'tv':
      return <TvScreen />
    case 'settings':
      return <SettingsScreen />
    case 'browse':
      return <BrowseScreen />
    case 'files':
      return <FileManagerScreen />
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
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className="h-screen w-screen"
        >
          <ErrorBoundary key={screen}>{renderScreen(screen)}</ErrorBoundary>
        </motion.div>
      </AnimatePresence>
      {/* Mounted outside the per-screen boundary/transition so it's reachable
          (and survives) regardless of which screen is showing or crashes. */}
      <QuickMenu />
      <CrashToast />
    </>
  )
}

export default App
