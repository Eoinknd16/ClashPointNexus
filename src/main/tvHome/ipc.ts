import { ipcMain } from 'electron'
import type { NewTvHomeBlock, ResolvedTvHomeBlock, TvHomeConfig } from '@shared/tvHomeTypes'
import {
  addTvHomeBlock,
  addTvHomePage,
  getTvHomeConfig,
  moveTvHomeBlock,
  removeTvHomeBlock,
  removeTvHomePage,
  renameTvHomePage,
  resolveTvHomePage,
  setActiveTvHomePage
} from './service'

export function registerTvHomeIpc(): void {
  ipcMain.handle('tvHome:getConfig', (): TvHomeConfig => getTvHomeConfig())

  ipcMain.handle('tvHome:resolvePage', (_event, pageId: string): Promise<ResolvedTvHomeBlock[]> =>
    resolveTvHomePage(pageId)
  )

  ipcMain.handle('tvHome:addPage', (_event, name: string): TvHomeConfig => addTvHomePage(name))
  ipcMain.handle('tvHome:removePage', (_event, pageId: string): TvHomeConfig => removeTvHomePage(pageId))
  ipcMain.handle('tvHome:renamePage', (_event, pageId: string, name: string): TvHomeConfig =>
    renameTvHomePage(pageId, name)
  )
  ipcMain.handle('tvHome:setActivePage', (_event, pageId: string): TvHomeConfig => setActiveTvHomePage(pageId))

  ipcMain.handle(
    'tvHome:addBlock',
    (_event, pageId: string, block: NewTvHomeBlock): TvHomeConfig => addTvHomeBlock(pageId, block)
  )
  ipcMain.handle('tvHome:removeBlock', (_event, pageId: string, blockId: string): TvHomeConfig =>
    removeTvHomeBlock(pageId, blockId)
  )
  ipcMain.handle('tvHome:moveBlock', (_event, pageId: string, blockId: string, direction: -1 | 1): TvHomeConfig =>
    moveTvHomeBlock(pageId, blockId, direction)
  )
}
