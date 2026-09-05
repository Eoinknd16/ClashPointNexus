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

type NavHandler = (action: NavAction) => void

const listeners = new Set<NavHandler>()

/**
 * Fired by input sources (gamepad, keyboard). Screens subscribe via useNavListener.
 * Each listener runs in its own try/catch: a listener throwing a plain JS error
 * (not a React render error, so ErrorBoundary can't see it) must not stop the
 * other listeners from running or unwind back into the gamepad rAF loop's
 * caller — an uncaught throw there skips the loop's own requestAnimationFrame
 * reschedule and permanently kills all gamepad input for the rest of the session.
 */
export function emitNav(action: NavAction): void {
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
