import { ipcMain, shell } from 'electron'
import type { CatalogType } from '@shared/stremioTypes'
import { STREAMING_SERVICES, type WatchAvailability } from '@shared/streamingProviders'
import { getTmdbApiKey, setTmdbApiKey } from './config'
import { getWatchAvailability } from './tmdb'

export function registerStreamingIpc(): void {
  ipcMain.handle('streaming:getApiKey', (): string => getTmdbApiKey())

  ipcMain.handle('streaming:setApiKey', (_event, key: string): void => {
    setTmdbApiKey(key)
  })

  ipcMain.handle(
    'streaming:getAvailability',
    (_event, imdbId: string, type: CatalogType): Promise<WatchAvailability> => getWatchAvailability(imdbId, type)
  )

  // Always hands off to the system's default browser (never Nexus's own
  // embedded webview) — Netflix/Disney+/etc.'s DRM playback generally
  // refuses to run inside an unrecognized Chromium embedder anyway, and a
  // real browser (Edge, Chrome) is a properly DRM-certified environment
  // that just works. This briefly leaves Nexus's fullscreen kiosk view,
  // which is the honest tradeoff for "legally hand off to the real thing"
  // rather than a broken/blank in-app player pretending to be seamless.
  ipcMain.handle('streaming:openService', (_event, serviceId: string, title: string): void => {
    const service = STREAMING_SERVICES.find((s) => s.id === serviceId)
    if (!service) return
    void shell.openExternal(service.searchUrl(title))
  })
}
