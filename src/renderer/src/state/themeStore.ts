import { create } from 'zustand'
import type { ThemeDefinition } from '@shared/themeTypes'
import { applyTheme } from '../themes/applyTheme'
import { BUILT_IN_THEMES, DEFAULT_THEME_ID } from '../themes/builtInThemes'

const STORAGE_KEY = 'tv-launcher-theme-id'

interface ThemeState {
  themeId: string
  customThemes: ThemeDefinition[]
  allThemes: ThemeDefinition[]
  init: () => Promise<void>
  setTheme: (id: string) => void
  /** Re-reads themes.config.json — a theme installed mid-session (File
   * Manager's "Install as Theme") won't appear in Settings' theme list
   * until something re-fetches it, since init() only ever runs once at
   * app launch. Called every time Settings mounts. */
  refreshCustomThemes: () => Promise<void>
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  themeId: DEFAULT_THEME_ID,
  customThemes: [],
  allThemes: BUILT_IN_THEMES,

  init: async () => {
    let customThemes: ThemeDefinition[] = []
    try {
      customThemes = await window.api.settings.getCustomThemes()
    } catch {
      // themes.config.json missing/invalid — just run with built-ins
    }
    const allThemes = [...BUILT_IN_THEMES, ...customThemes]

    let themeId = DEFAULT_THEME_ID
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && allThemes.some((t) => t.id === stored)) themeId = stored
    } catch {
      // localStorage unavailable — fall back to default
    }

    set({ customThemes, allThemes, themeId })
    const theme = allThemes.find((t) => t.id === themeId) ?? BUILT_IN_THEMES[0]
    applyTheme(theme)
  },

  setTheme: (id: string) => {
    const theme = get().allThemes.find((t) => t.id === id)
    if (!theme) return
    applyTheme(theme)
    set({ themeId: id })
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // per-viewer convenience only — fine if it doesn't persist
    }
  },

  refreshCustomThemes: async () => {
    try {
      const customThemes = await window.api.settings.getCustomThemes()
      set({ customThemes, allThemes: [...BUILT_IN_THEMES, ...customThemes] })
    } catch {
      // themes.config.json missing/invalid — just keep whatever's already loaded
    }
  }
}))
