import { ipcMain, shell } from 'electron'
import { appendLog, logsDir } from './service'

export function registerLoggingIpc(): void {
  ipcMain.handle('logging:reportError', (_event, message: string): void => {
    appendLog('error', `[renderer] ${message}`)
  })

  ipcMain.handle('logging:openLogsFolder', async (): Promise<void> => {
    await shell.openPath(logsDir())
  })
}
