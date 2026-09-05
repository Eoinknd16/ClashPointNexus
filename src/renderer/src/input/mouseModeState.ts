/**
 * Kept in sync with the main process's Mouse Mode state (see App.tsx) so
 * useGamepadNav can suppress in-app nav-action emission while it's active —
 * without this, the SAME physical button press fires twice: once as a real
 * OS-level click via the global helper process (a separate, independent
 * poll of the same controller), and once as this app's own in-app "confirm"
 * NavAction via Chromium's Gamepad API, landing on whatever the app's own
 * controller-focus happens to be — a completely different target than
 * wherever the real mouse cursor is. Plain mutable module state, not React,
 * matching navBus.ts's overrideListener and activePlayback.ts — this needs
 * to be read synchronously inside a rAF loop, not through a render cycle.
 */
let mouseModeActive = false

export function setMouseModeActive(active: boolean): void {
  mouseModeActive = active
}

export function isMouseModeActive(): boolean {
  return mouseModeActive
}
