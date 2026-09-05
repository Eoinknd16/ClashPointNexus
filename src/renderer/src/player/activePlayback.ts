/**
 * Lets navigationStore (plain zustand, no React tree access) reach into
 * whatever's currently playing video in TvScreen and stop it *before* a
 * top-level screen change starts, not just whenever TvScreen eventually
 * unmounts. That distinction matters: AnimatePresence's mode="wait" keeps
 * the outgoing screen mounted (invisible, mid-exit-fade) until its exit
 * animation reports finished — and a <video> still playing during that fade
 * keeps firing onTimeUpdate, continuously re-rendering the "exiting" screen
 * the whole time. That's enough to keep Framer Motion from ever considering
 * the exit done, so the incoming screen never mounts and the outgoing one
 * (audio and all) never tears down — a stuck-blank-page failure mode that
 * looks identical to a crash but isn't one; nothing throws.
 */
let stopFn: (() => void) | null = null

export function registerActivePlaybackStop(fn: (() => void) | null): void {
  stopFn = fn
}

export function stopActivePlayback(): void {
  stopFn?.()
}
