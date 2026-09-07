import { ArrowLeft, X } from 'lucide-react'

/** Shared "leave this screen/panel" affordances for mouse & keyboard users —
 * every screen already has a `back`/`menu` NavAction wired up for D-pad/
 * controller/keyboard (Backspace/Escape), but before this there was no
 * visible, clickable equivalent anywhere, so a mouse-only user had no way
 * out. Styled entirely off theme vars (rounded-control, surface/accent
 * colors) so it always matches whatever theme is active, same as every
 * other themed control in the app. */

interface BackButtonProps {
  onClick: () => void
  /** Defaults to "Back" — screens that leave straight to Home use "Home"
   * instead, and a video player uses "Exit Player", so the label always
   * says what actually happens. */
  label?: string
  className?: string
}

export function BackButton({ onClick, label = 'Back', className = '' }: BackButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-control bg-surface/70 px-4 py-2 text-sm font-medium text-muted ring-1 ring-white/10 backdrop-blur-md transition-colors hover:bg-surface-hover hover:text-white ${className}`}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  )
}

/** Small circular X — for closing a detail panel/overlay in place rather
 * than navigating away (e.g. a game/movie detail panel, a context menu). */
export function CloseButton({
  onClick,
  className = ''
}: {
  onClick: () => void
  className?: string
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-control bg-surface-hover text-muted transition-colors hover:bg-surface-hi hover:text-white ${className}`}
    >
      <X className="h-4 w-4" />
    </button>
  )
}
