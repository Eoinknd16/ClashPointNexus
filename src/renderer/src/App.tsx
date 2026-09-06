import { useEffect } from 'react'
import { useGamepadNav } from './input/useGamepadNav'
import { useKeyboardNav } from './input/useKeyboardNav'
import { emitNav, subscribeNav } from './input/navBus'
import { setMouseModeActive } from './input/mouseModeState'
import { useNavigationStore, type ScreenId } from './state/navigationStore'
import { useThemeStore } from './state/themeStore'
import { HomeMenu } from './screens/HomeMenu'
import { GamesScreen } from './screens/GamesScreen'
import { TvScreen } from './screens/TvScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { BrowseScreen } from './screens/BrowseScreen'
import { FileManagerScreen } from './screens/FileManagerScreen'
import { AppsScreen } from './screens/AppsScreen'
import { ArcadeScreen } from './screens/ArcadeScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { StoreScreen } from './screens/StoreScreen'
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
    case 'apps':
      return <AppsScreen />
    case 'arcade':
      return <ArcadeScreen />
    case 'library':
      return <LibraryScreen />
    case 'store':
      return <StoreScreen />
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

  // PS/Home button clicked (not held) — main process already foregrounded
  // this window, just needs to navigate home.
  useEffect(() => window.api.globalInput.onGoHome(() => useNavigationStore.getState().goHome()), [])

  // Keeps useGamepadNav's double-click-suppression flag in sync with the
  // actual global Mouse Mode state — fetched once for whatever it already
  // was (e.g. toggled on by the physical combo before this window ever had
  // focus) plus live updates after that.
  useEffect(() => {
    window.api.globalInput.getMouseModeStatus().then(setMouseModeActive).catch(() => {})
    return window.api.globalInput.onMouseModeChanged(setMouseModeActive)
  }, [])

  // Cursor visibility (index.css) — shown on any real mouse movement, hidden
  // again on the next controller nav action. Deliberately not gated on Mouse
  // Mode specifically: Mouse Mode's cursor movement is a genuine OS-level
  // mousemove too (a real SetCursorPos call, indistinguishable from physical
  // movement at the browser level), so this covers it for free, and a plain
  // mouse/keyboard user with no controller at all keeps a visible cursor
  // exactly when they're using it — gating on Mouse Mode alone would have
  // hidden their cursor permanently instead.
  useEffect(() => {
    const showCursor = (): void => document.body.setAttribute('data-cursor-visible', 'true')
    const hideCursor = (): void => document.body.setAttribute('data-cursor-visible', 'false')
    window.addEventListener('mousemove', showCursor)
    const unsubscribeNav = subscribeNav(hideCursor)
    return () => {
      window.removeEventListener('mousemove', showCursor)
      unsubscribeNav()
    }
  }, [])

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
