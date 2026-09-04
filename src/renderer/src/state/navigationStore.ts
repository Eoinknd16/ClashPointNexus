import { create } from 'zustand'

export type ScreenId = 'home' | 'games' | 'tv' | 'browse' | 'settings'

interface NavigationState {
  screen: ScreenId
  goTo: (screen: ScreenId) => void
  goHome: () => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  screen: 'home',
  goTo: (screen) => set({ screen }),
  goHome: () => set({ screen: 'home' })
}))
