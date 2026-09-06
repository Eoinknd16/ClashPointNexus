import { useEffect, useState } from 'react'
import { Home, Monitor, Mouse, Volume1, Volume2, VolumeX, X, type LucideIcon } from 'lucide-react'
import { useGamepadNav } from '../input/useGamepadNav'
import { useKeyboardNav } from '../input/useKeyboardNav'
import { useNavListener } from '../input/useNavListener'
import { setMouseModeActive } from '../input/mouseModeState'
import { useThemeStore } from '../state/themeStore'

type ActionId = 'returnToNexus' | 'toggleMouseMode' | 'goToDesktop' | 'volumeUp' | 'volumeDown' | 'toggleMute' | 'close'

interface Option {
  id: ActionId
  label: string
  icon: LucideIcon
}

/**
 * The root component for the Control Center window (a genuinely separate
 * always-on-top BrowserWindow, see main/controlCenter/window.ts) — reached
 * by holding PS/Home, distinct from the Quick Menu (which lives inside the
 * main Nexus window and requires switching to it first). Mounted instead of
 * <App/> when the page loads with ?view=controlcenter (see main.tsx), so it
 * has its own gamepad/keyboard nav wiring rather than going through the
 * normal screen system at all.
 */
export function ControlCenterOverlay(): JSX.Element {
  const [index, setIndex] = useState(0)
  const [mouseModeOn, setMouseModeOn] = useState(false)
  const initTheme = useThemeStore((s) => s.init)

  useGamepadNav()
  useKeyboardNav()

  useEffect(() => {
    void initTheme()
  }, [initTheme])

  // Same reasoning as App.tsx: useGamepadNav suppresses in-app nav emission
  // while Mouse Mode is active, so this window's own copy of that flag has
  // to be kept live too, not just the label below.
  useEffect(() => {
    window.api.globalInput
      .getMouseModeStatus()
      .then((active) => {
        setMouseModeOn(active)
        setMouseModeActive(active)
      })
      .catch(() => {})
    return window.api.globalInput.onMouseModeChanged((active) => {
      setMouseModeOn(active)
      setMouseModeActive(active)
    })
  }, [])

  const options: Option[] = [
    { id: 'returnToNexus', label: 'Return to Nexus', icon: Home },
    { id: 'toggleMouseMode', label: mouseModeOn ? 'Disable Mouse Mode' : 'Enable Mouse Mode', icon: Mouse },
    { id: 'goToDesktop', label: 'Show Desktop', icon: Monitor },
    { id: 'volumeUp', label: 'Volume Up', icon: Volume2 },
    { id: 'volumeDown', label: 'Volume Down', icon: Volume1 },
    { id: 'toggleMute', label: 'Mute', icon: VolumeX },
    { id: 'close', label: 'Close', icon: X }
  ]

  function runAction(id: ActionId): void {
    switch (id) {
      case 'returnToNexus':
        void window.api.controlCenter.returnToNexus()
        return
      case 'toggleMouseMode':
        void window.api.globalInput.toggleMouseMode()
        return
      case 'goToDesktop':
        void window.api.globalInput.goToDesktop()
        void window.api.controlCenter.close()
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
      case 'close':
        void window.api.controlCenter.close()
        return
      default:
        return
    }
  }

  useNavListener((action) => {
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
        void window.api.controlCenter.close()
        return
      default:
        return
    }
  })

  return (
    <div className="flex h-screen w-screen flex-col gap-6 bg-surface/95 p-6 ring-1 ring-white/10">
      <h1 className="text-xl font-bold tracking-tight">Control Center</h1>
      <div className="flex flex-col gap-2">
        {options.map((option, i) => (
          <div
            key={option.id}
            onClick={() => {
              setIndex(i)
              runAction(option.id)
            }}
            className={`flex cursor-pointer items-center gap-3 rounded-xl px-5 py-3 font-medium ring-1 transition-colors ${
              index === i ? 'bg-accent text-white shadow-focus ring-2 ring-accent' : 'bg-surface-hi ring-accent/15'
            }`}
          >
            <option.icon className="h-5 w-5 shrink-0" />
            {option.label}
          </div>
        ))}
      </div>
      <p className="mt-auto text-xs text-muted">Hold PS/Home again to close · Click PS/Home to return to Nexus</p>
    </div>
  )
}
