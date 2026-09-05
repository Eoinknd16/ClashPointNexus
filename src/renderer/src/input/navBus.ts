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

type NavHandler = (action: NavAction) => void

const listeners = new Set<NavHandler>()

/** Fired by input sources (gamepad, keyboard). Screens subscribe via useNavListener. */
export function emitNav(action: NavAction): void {
  for (const listener of listeners) listener(action)
}

export function subscribeNav(handler: NavHandler): () => void {
  listeners.add(handler)
  return () => listeners.delete(handler)
}
