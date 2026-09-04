import { ipcMain } from 'electron'
import { getContinueSuggestion } from './service'

export function registerHomeIpc(): void {
  ipcMain.handle('home:getContinueSuggestion', () => getContinueSuggestion())
}
