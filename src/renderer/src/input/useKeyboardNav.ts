import { useEffect } from 'react'
import { emitNav, type NavAction } from './navBus'

const KEY_MAP: Record<string, NavAction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'confirm',
  Backspace: 'back',
  Escape: 'menu',
  '[': 'prevStream',
  ']': 'nextStream',
  '-': 'volumeDown',
  '_': 'volumeDown',
  '=': 'volumeUp',
  '+': 'volumeUp',
  s: 'toggleSubtitles',
  S: 'toggleSubtitles'
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

/**
 * Dev-time fallback so the UI is navigable without a controller plugged in —
 * and, for real usage, lets a physical keyboard drive the app too. Bails out
 * entirely while a real <input>/<textarea> has focus so typing, arrow-key
 * cursor movement, and paste all work natively instead of being hijacked as
 * app navigation.
 */
export function useKeyboardNav(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return

      const action = KEY_MAP[event.key]
      if (!action) return
      event.preventDefault()
      emitNav(action)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
