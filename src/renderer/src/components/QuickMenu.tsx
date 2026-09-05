import { useEffect, useState } from 'react'
import { useNavListener, useExclusiveNavListener } from '../input/useNavListener'
import { useNavigationStore } from '../state/navigationStore'
import type { GameEntry } from '@shared/steamTypes'

type ActionId =
  | 'resumeGame'
  | 'home'
  | 'settings'
  | 'volumeUp'
  | 'volumeDown'
  | 'toggleMute'
  | 'toggleMouseMode'
  | 'goToDesktop'
  | 'sleep'
  | 'restart'
  | 'shutdown'
  | 'quit'
interface Option {
  id: ActionId
  label: string
}

/**
 * Always-mounted overlay reachable from any screen (R3 / right-stick click,
 * "q" on a keyboard) — home, settings, power, and jumping back into whatever
 * Steam game was played most recently. Steals nav input exclusively while
 * open via useExclusiveNavListener, so the screen underneath doesn't also
 * react to the same presses.
 *
 * "Resume Game" launches through Steam's own protocol handler, which already
 * brings an already-running game to the foreground instead of relaunching it
 * — but that only works while ClashPoint Nexus itself has focus to receive
 * the button press. A game running full-screen has OS input focus, and the
 * Gamepad API only delivers to whichever window is focused, so this menu
 * can't be summoned FROM INSIDE that game the same way — that would need a
 * global raw-input listener plus an always-on-top overlay window (the same
 * shape of feature as Steam's own overlay), which hasn't been built.
 */
export function QuickMenu(): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [confirmAction, setConfirmAction] = useState<'restart' | 'shutdown' | null>(null)
  const [confirmIndex, setConfirmIndex] = useState(0)
  const [mostRecentGame, setMostRecentGame] = useState<GameEntry | null>(null)
  const [mouseModeActive, setMouseModeActive] = useState(false)
  const goTo = useNavigationStore((s) => s.goTo)
  const goHome = useNavigationStore((s) => s.goHome)

  // Kept live regardless of whether the menu is open — the physical L1+R1+
  // Back combo can toggle Mouse Mode without ever opening this menu at all,
  // so the label has to reflect real state, not just what this menu itself
  // last set it to.
  useEffect(() => {
    window.api.globalInput.getMouseModeStatus().then(setMouseModeActive).catch(() => {})
    return window.api.globalInput.onMouseModeChanged(setMouseModeActive)
  }, [])

  function buildOptions(): Option[] {
    const options: Option[] = []
    if (mostRecentGame) options.push({ id: 'resumeGame', label: `▶ Resume "${mostRecentGame.name}"` })
    options.push({ id: 'home', label: '🏠 Home' })
    options.push({ id: 'settings', label: '⚙️ Settings' })
    options.push({ id: 'volumeUp', label: '🔊 Volume Up' })
    options.push({ id: 'volumeDown', label: '🔉 Volume Down' })
    options.push({ id: 'toggleMute', label: '🔇 Mute' })
    options.push({
      id: 'toggleMouseMode',
      label: mouseModeActive ? '🖱️ Disable Mouse Mode' : '🖱️ Enable Mouse Mode'
    })
    options.push({ id: 'goToDesktop', label: '🖥️ Show Desktop' })
    options.push({ id: 'sleep', label: '💤 Sleep' })
    options.push({ id: 'restart', label: '🔁 Restart PC' })
    options.push({ id: 'shutdown', label: '⏻ Shut Down PC' })
    options.push({ id: 'quit', label: '✖ Quit ClashPoint Nexus' })
    return options
  }

  function closeMenu(): void {
    setOpen(false)
    setConfirmAction(null)
  }

  function openMenu(): void {
    setIndex(0)
    setConfirmAction(null)
    window.api.steam
      .getLibrary()
      .then((result) => {
        const sorted = [...result.games].sort((a, b) => b.lastPlayed - a.lastPlayed)
        setMostRecentGame(sorted[0] ?? null)
      })
      .catch(() => setMostRecentGame(null))
    setOpen(true)
  }

  function runAction(id: ActionId): void {
    switch (id) {
      case 'resumeGame':
        if (mostRecentGame) {
          window.api.steam.launch(mostRecentGame.launch).catch((error) => {
            // eslint-disable-next-line no-console
            console.error('[QuickMenu] resumeGame launch failed:', error)
          })
        }
        closeMenu()
        return
      case 'home':
        goHome()
        closeMenu()
        return
      case 'settings':
        goTo('settings')
        closeMenu()
        return
      case 'volumeUp':
        void window.api.system.volumeUp()
        return
      case 'volumeDown':
        void window.api.system.volumeDown()
        return
      case 'toggleMute':
        void window.api.system.toggleMute()
        return
      case 'toggleMouseMode':
        void window.api.globalInput.toggleMouseMode()
        closeMenu()
        return
      case 'goToDesktop':
        void window.api.globalInput.goToDesktop()
        closeMenu()
        return
      case 'sleep':
        void window.api.power.sleep()
        closeMenu()
        return
      case 'restart':
        setConfirmIndex(0)
        setConfirmAction('restart')
        return
      case 'shutdown':
        setConfirmIndex(0)
        setConfirmAction('shutdown')
        return
      case 'quit':
        void window.api.power.quitApp()
        return
      default:
        return
    }
  }

  // Always active (no screenId filter) so a press opens this from any screen —
  // once open, useExclusiveNavListener below takes over instead.
  useNavListener((action) => {
    if (action === 'quickMenu' && !open) openMenu()
  })

  useExclusiveNavListener((action) => {
    if (confirmAction) {
      switch (action) {
        case 'left':
        case 'right':
          setConfirmIndex((i) => (i === 0 ? 1 : 0))
          return
        case 'confirm':
          if (confirmIndex === 0) {
            if (confirmAction === 'restart') void window.api.power.restart()
            else void window.api.power.shutdown()
          }
          closeMenu()
          return
        case 'back':
        case 'menu':
        case 'quickMenu':
          setConfirmAction(null)
          return
        default:
          return
      }
    }

    const options = buildOptions()
    switch (action) {
      case 'up':
        setIndex((i) => Math.max(0, i - 1))
        return
      case 'down':
        setIndex((i) => Math.min(options.length - 1, i + 1))
        return
      case 'confirm': {
        const option = options[index]
        if (option) runAction(option.id)
        return
      }
      case 'back':
      case 'menu':
      case 'quickMenu':
        closeMenu()
        return
      default:
        return
    }
  }, open)

  if (!open) return null

  const options = buildOptions()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="flex w-80 flex-col gap-4 rounded-2xl bg-surface p-8">
        {confirmAction ? (
          <>
            <h2 className="text-lg font-semibold">
              {confirmAction === 'restart' ? 'Restart the PC now?' : 'Shut down the PC now?'}
            </h2>
            <div className="flex gap-3">
              {['Yes', 'No'].map((label, i) => (
                <div
                  key={label}
                  onClick={() => {
                    setConfirmIndex(i)
                    if (i === 0) {
                      if (confirmAction === 'restart') void window.api.power.restart()
                      else void window.api.power.shutdown()
                    }
                    closeMenu()
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
        ) : (
          <>
            <h2 className="text-lg font-semibold">Quick Menu</h2>
            <div className="flex flex-col gap-2">
              {options.map((option, i) => (
                <div
                  key={option.id}
                  onClick={() => {
                    setIndex(i)
                    runAction(option.id)
                  }}
                  className={`cursor-pointer rounded-xl px-5 py-3 font-medium transition-colors ${
                    index === i ? 'bg-accent text-white' : 'bg-surface-hi text-muted'
                  }`}
                >
                  {option.label}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
