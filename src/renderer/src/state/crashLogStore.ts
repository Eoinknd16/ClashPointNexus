import { create } from 'zustand'

interface CrashLogState {
  lastError: string | null
  reportError: (message: string) => void
  clear: () => void
}

/** A plain module (not a component), so navBus.ts and main.tsx's global
 * error/rejection handlers can report into it without needing React context —
 * same reason navBus.ts itself works this way. */
export const useCrashLogStore = create<CrashLogState>((set) => ({
  lastError: null,
  reportError: (message) => set({ lastError: message }),
  clear: () => set({ lastError: null })
}))
