import { ipcMain } from 'electron'
import type { CommunityPluginSummary } from '@shared/pluginTypes'
import { listCommunityPlugins } from './communityPlugins'

export function registerPluginsIpc(): void {
  ipcMain.handle('plugins:listCommunity', (): Promise<CommunityPluginSummary[]> => listCommunityPlugins())
}
