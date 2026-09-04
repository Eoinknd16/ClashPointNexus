import { create } from 'zustand'
import type { GameEntry } from '@shared/steamTypes'
import type { CatalogItem, CatalogType } from '@shared/stremioTypes'

export type ScreenId = 'home' | 'games' | 'tv' | 'browse' | 'files' | 'settings'

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
  goTo: (screen, pendingContinue) => set({ screen, pendingContinue: pendingContinue ?? null }),
  goHome: () => set({ screen: 'home', pendingContinue: null }),
  consumePendingContinue: () => {
    const action = get().pendingContinue
    if (action) set({ pendingContinue: null })
    return action
  }
}))
