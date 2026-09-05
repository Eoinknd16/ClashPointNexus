import { ipcMain } from 'electron'
import {
  copyEntry,
  createFolder,
  deleteEntry,
  getHomeDirectory,
  getParentPath,
  listDirectory,
  listDrives,
  moveEntry,
  openPath,
  renameEntry
} from './service'

export function registerFilesystemIpc(): void {
  ipcMain.handle('filesystem:listDrives', () => listDrives())
  ipcMain.handle('filesystem:listDirectory', (_event, dirPath: string) => listDirectory(dirPath))
  ipcMain.handle('filesystem:getParentPath', (_event, dirPath: string) => getParentPath(dirPath))
  ipcMain.handle('filesystem:getHomeDirectory', () => getHomeDirectory())
  ipcMain.handle('filesystem:openPath', (_event, targetPath: string) => openPath(targetPath))
  ipcMain.handle('filesystem:rename', (_event, targetPath: string, newName: string) =>
    renameEntry(targetPath, newName)
  )
  ipcMain.handle('filesystem:delete', (_event, targetPath: string) => deleteEntry(targetPath))
  ipcMain.handle('filesystem:createFolder', (_event, parentDir: string, name: string) =>
    createFolder(parentDir, name)
  )
  ipcMain.handle('filesystem:copy', (_event, sourcePath: string, destDir: string) =>
    copyEntry(sourcePath, destDir)
  )
  ipcMain.handle('filesystem:move', (_event, sourcePath: string, destDir: string) =>
    moveEntry(sourcePath, destDir)
  )
}
