import { useEffect } from 'react'
import { useGamepadNav } from './input/useGamepadNav'
import { useKeyboardNav } from './input/useKeyboardNav'
import { emitNav } from './input/navBus'
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

  // The main process has already brought the window to the foreground by the
  // time this fires (the physical combo works regardless of which window had
  // focus) — reuses the exact same Quick Menu the R3 stick-click already
  // opens in-app, just triggered from outside instead of via the Gamepad API.
  useEffect(() => window.api.globalInput.onOpenQuickMenu(() => emitNav('quickMenu')), [])

  return (
    <>
      {/*
        Plain conditional render, not AnimatePresence — the fade transition
        it drove here depended on framer-motion's exit-animation-completion
        callback ever actually firing to unmount the outgoing screen. That
        callback getting stuck (confirmed: the outgoing screen's own <video>
        stayed mounted and click-interactive, just invisible at opacity:0)
        is what caused the recurring blank-screen bug — the incoming screen
        never got a chance to mount because AnimatePresence's mode="wait"
        was still waiting on a completion signal that never came. A plain
        keyed div ties unmount/mount directly to React's own reconciliation,
        which can't get stuck like that — at the cost of the fade itself.
      */}
      <div key={screen} className="h-screen w-screen">
        <ErrorBoundary key={screen}>{renderScreen(screen)}</ErrorBoundary>
      </div>
      {/* Mounted outside the per-screen boundary so it's reachable (and
          survives) regardless of which screen is showing or crashes. */}
      <QuickMenu />
      <CrashToast />
    </>
  )
}

export default App
