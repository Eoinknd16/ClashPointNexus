import { ipcMain } from 'electron'
import { getHighScores, submitScore } from './scores'

export function registerArcadeIpc(): void {
  ipcMain.handle('arcade:getHighScores', () => getHighScores())
  ipcMain.handle('arcade:submitScore', (_event, name: string, score: number) => submitScore(name, score))
}
