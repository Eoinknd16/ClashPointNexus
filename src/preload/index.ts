import { contextBridge, ipcRenderer } from 'electron'
import type { LauncherApi } from '@shared/api'

const api: LauncherApi = {
  steam: {
    getLibrary: () => ipcRenderer.invoke('steam:getLibrary'),
    launch: (target) => ipcRenderer.invoke('steam:launch', target),
    install: (appId) => ipcRenderer.invoke('steam:install', appId)
  },
  stremio: {
    getCatalog: (type, catalogId) => ipcRenderer.invoke('stremio:getCatalog', type, catalogId),
    getStreams: (type, id) => ipcRenderer.invoke('stremio:getStreams', type, id),
    getReleaseDate: (type, id) => ipcRenderer.invoke('stremio:getReleaseDate', type, id)
  },
  settings: {
    getSteam: () => ipcRenderer.invoke('settings:getSteam'),
    setSteam: (settings) => ipcRenderer.invoke('settings:setSteam', settings),
    getStremio: () => ipcRenderer.invoke('settings:getStremio'),
    setStremioAddons: (streamAddons) => ipcRenderer.invoke('settings:setStremioAddons', streamAddons),
    addStremioAddon: (url) => ipcRenderer.invoke('settings:addStremioAddon', url),
    stremioLogin: (email, password) => ipcRenderer.invoke('settings:stremioLogin', email, password),
    getCustomThemes: () => ipcRenderer.invoke('settings:getCustomThemes')
  },
  player: {
    probeMediaInfo: (url) => ipcRenderer.invoke('player:probeMediaInfo', url)
  },
  subtitles: {
    getTracks: (type, id) => ipcRenderer.invoke('subtitles:getTracks', type, id)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error non-isolated fallback
  window.api = api
}
