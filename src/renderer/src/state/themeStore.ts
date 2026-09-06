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
  /** Patches one custom theme's vars in place (the in-app color picker) —
   * updates the in-memory copy immediately (so the theme list's swatch and
   * a live preview both reflect it right away, re-applying to :root if it's
   * the active theme) and persists to themes.config.json in the background.
   * Only meaningful for custom/installed themes; built-ins aren't tracked
   * in that file at all, so persistence silently no-ops for them (the UI
   * never offers this for a built-in theme in the first place). */
  updateThemeVars: (id: string, vars: Record<string, string>) => void
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
  },

  updateThemeVars: (id, vars) => {
    const theme = get().allThemes.find((t) => t.id === id)
    if (!theme) return
    const updated: ThemeDefinition = { ...theme, vars }
    set((state) => ({
      customThemes: state.customThemes.map((t) => (t.id === id ? updated : t)),
      allThemes: state.allThemes.map((t) => (t.id === id ? updated : t))
    }))
    if (get().themeId === id) applyTheme(updated)
    window.api.settings.updateThemeVars(id, vars).catch(() => {
      // best-effort persistence -- the live preview above already applied either way
    })
  }
}))
