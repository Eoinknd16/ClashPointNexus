export type NavAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'confirm'
  | 'back'
  | 'menu'
  | 'prevStream'
  | 'nextStream'
  | 'volumeDown'
  | 'volumeUp'
  | 'toggleSubtitles'
  | 'skipNext'
  | 'search'
  | 'contextMenu'
  | 'quickMenu'

type NavHandler = (action: NavAction) => void

const listeners = new Set<NavHandler>()

// The Quick Menu (always-accessible overlay, opened from any screen) needs
// exclusive input while it's open — otherwise the screen underneath it would
// also react to the same up/down/confirm presses. Rather than have every
// screen's own listener special-case "is the quick menu open" (six-plus call
// sites, easy to miss one), emitNav itself routes everything to a single
// override handler when one is set, same idea as a modal capturing focus.
let overrideListener: NavHandler | null = null

export function setOverrideNav(handler: NavHandler | null): void {
  overrideListener = handler
}

/**
 * Fired by input sources (gamepad, keyboard). Screens subscribe via useNavListener.
 * Each listener runs in its own try/catch: a listener throwing a plain JS error
 * (not a React render error, so ErrorBoundary can't see it) must not stop the
 * other listeners from running or unwind back into the gamepad rAF loop's
 * caller — an uncaught throw there skips the loop's own requestAnimationFrame
 * reschedule and permanently kills all gamepad input for the rest of the session.
 */
export function emitNav(action: NavAction): void {
  if (overrideListener) {
    try {
      overrideListener(action)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[navBus] override listener threw for action:', action, error)
    }
    return
  }
  for (const listener of listeners) {
    try {
      listener(action)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[navBus] listener threw for action:', action, error)
    }
  }
}

export function subscribeNav(handler: NavHandler): () => void {
  listeners.add(handler)
  return () => listeners.delete(handler)
}
