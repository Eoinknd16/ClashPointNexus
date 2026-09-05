import { create } from 'zustand'
import { stopActivePlayback } from '../player/activePlayback'
import type { GameEntry } from '@shared/steamTypes'
import type { CatalogItem, CatalogType } from '@shared/stremioTypes'

export type ScreenId = 'home' | 'games' | 'tv' | 'browse' | 'files' | 'apps' | 'arcade' | 'settings'

/** Set by the Home screen's "Continue" card so the target screen can jump
 * straight to the right content on mount instead of just opening blank. */
export type PendingContinueAction =
  | { kind: 'game'; game: GameEntry }
  | { kind: 'tv'; tab: CatalogType; item: CatalogItem }

interface NavigationState {
  screen: ScreenId
  pendingContinue: PendingContinueAction | null
  goTo: (screen: ScreenId, pendingContinue?: PendingContinueAction) => void
  goHome: () => void
  /** Reads and clears pendingContinue in one step — a screen should only ever act on it once. */
  consumePendingContinue: () => PendingContinueAction | null
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  screen: 'home',
  pendingContinue: null,
  goTo: (screen, pendingContinue) => {
    // Stops any TV playback synchronously before the transition even starts
    // — see activePlayback.ts for why that matters (a video still playing
    // during AnimatePresence's exit fade can keep that fade from ever being
    // considered finished, leaving the outgoing screen stuck mounted and the
    // incoming one never mounted at all — a stuck-blank-page failure that
    // isn't a crash, so nothing anywhere would have caught it).
    stopActivePlayback()
    set({ screen, pendingContinue: pendingContinue ?? null })
  },
  goHome: () => {
    stopActivePlayback()
    set({ screen: 'home', pendingContinue: null })
  },
  consumePendingContinue: () => {
    const action = get().pendingContinue
    if (action) set({ pendingContinue: null })
    return action
  }
}))
