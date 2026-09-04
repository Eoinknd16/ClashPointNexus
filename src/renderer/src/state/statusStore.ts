import { create } from 'zustand'

interface StatusState {
  message: string
  setMessage: (message: string) => void
}

export const useStatusStore = create<StatusState>((set) => ({
  message: 'Ready',
  setMessage: (message) => set({ message })
}))
