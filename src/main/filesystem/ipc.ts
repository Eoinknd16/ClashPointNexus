import { ipcMain } from 'electron'
import { getHomeDirectory, getParentPath, listDirectory, listDrives, openPath } from './service'

export function registerFilesystemIpc(): void {
  ipcMain.handle('filesystem:listDrives', () => listDrives())
  ipcMain.handle('filesystem:listDirectory', (_event, dirPath: string) => listDirectory(dirPath))
  ipcMain.handle('filesystem:getParentPath', (_event, dirPath: string) => getParentPath(dirPath))
  ipcMain.handle('filesystem:getHomeDirectory', () => getHomeDirectory())
  ipcMain.handle('filesystem:openPath', (_event, targetPath: string) => openPath(targetPath))
}
