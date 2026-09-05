import { contextBridge, ipcRenderer } from 'electron'
import type { LauncherApi } from '@shared/api'

const api: LauncherApi = {
  steam: {
    getLibrary: () => ipcRenderer.invoke('steam:getLibrary'),
    launch: (target) => ipcRenderer.invoke('steam:launch', target),
    install: (appId) => ipcRenderer.invoke('steam:install', appId)
  },
  stremio: {
    getCatalog: (type, catalogId, skip, genre) =>
      ipcRenderer.invoke('stremio:getCatalog', type, catalogId, skip, genre),
    getStreams: (type, id) => ipcRenderer.invoke('stremio:getStreams', type, id),
    getReleaseDate: (type, id) => ipcRenderer.invoke('stremio:getReleaseDate', type, id),
    getSeriesMeta: (id) => ipcRenderer.invoke('stremio:getSeriesMeta', id),
    getContinueWatching: (type) => ipcRenderer.invoke('stremio:getContinueWatching', type),
    getAddonCatalogs: (type) => ipcRenderer.invoke('stremio:getAddonCatalogs', type),
    search: (type, query) => ipcRenderer.invoke('stremio:search', type, query)
  },
  progress: {
    get: (type, id) => ipcRenderer.invoke('progress:get', type, id),
    save: (entry) => ipcRenderer.invoke('progress:save', entry),
    clear: (type, id) => ipcRenderer.invoke('progress:clear', type, id)
  },
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    has: (type, id) => ipcRenderer.invoke('library:has', type, id),
    add: (entry) => ipcRenderer.invoke('library:add', entry),
    remove: (type, id) => ipcRenderer.invoke('library:remove', type, id)
  },
  settings: {
    getSteam: () => ipcRenderer.invoke('settings:getSteam'),
    setSteam: (settings) => ipcRenderer.invoke('settings:setSteam', settings),
    getStremio: () => ipcRenderer.invoke('settings:getStremio'),
    setStremioAddons: (streamAddons) => ipcRenderer.invoke('settings:setStremioAddons', streamAddons),
    addStremioAddon: (url) => ipcRenderer.invoke('settings:addStremioAddon', url),
    stremioLogin: (email, password) => ipcRenderer.invoke('settings:stremioLogin', email, password),
    resyncStremioAddons: () => ipcRenderer.invoke('settings:resyncStremioAddons'),
    importStremioHistory: () => ipcRenderer.invoke('settings:importStremioHistory'),
    getCustomThemes: () => ipcRenderer.invoke('settings:getCustomThemes')
  },
  player: {
    probeMediaInfo: (url) => ipcRenderer.invoke('player:probeMediaInfo', url)
  },
  subtitles: {
    getTracks: (type, id) => ipcRenderer.invoke('subtitles:getTracks', type, id)
  },
  updater: {
    getStatus: () => ipcRenderer.invoke('updater:getStatus'),
    getVersion: () => ipcRenderer.invoke('updater:getVersion'),
    check: () => ipcRenderer.invoke('updater:check'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
    onStatus: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, status: Parameters<typeof callback>[0]): void =>
        callback(status)
      ipcRenderer.on('updater:status', listener)
      return () => ipcRenderer.removeListener('updater:status', listener)
    }
  },
  filesystem: {
    listDrives: () => ipcRenderer.invoke('filesystem:listDrives'),
    listDirectory: (dirPath) => ipcRenderer.invoke('filesystem:listDirectory', dirPath),
    getParentPath: (dirPath) => ipcRenderer.invoke('filesystem:getParentPath', dirPath),
    getHomeDirectory: () => ipcRenderer.invoke('filesystem:getHomeDirectory'),
    openPath: (targetPath) => ipcRenderer.invoke('filesystem:openPath', targetPath),
    rename: (targetPath, newName) => ipcRenderer.invoke('filesystem:rename', targetPath, newName),
    delete: (targetPath) => ipcRenderer.invoke('filesystem:delete', targetPath),
    createFolder: (parentDir, name) => ipcRenderer.invoke('filesystem:createFolder', parentDir, name),
    copy: (sourcePath, destDir) => ipcRenderer.invoke('filesystem:copy', sourcePath, destDir),
    move: (sourcePath, destDir) => ipcRenderer.invoke('filesystem:move', sourcePath, destDir)
  },
  power: {
    sleep: () => ipcRenderer.invoke('power:sleep'),
    restart: () => ipcRenderer.invoke('power:restart'),
    shutdown: () => ipcRenderer.invoke('power:shutdown'),
    quitApp: () => ipcRenderer.invoke('power:quitApp')
  },
  weather: {
    get: () => ipcRenderer.invoke('weather:get')
  },
  home: {
    getContinueSuggestion: () => ipcRenderer.invoke('home:getContinueSuggestion')
  },
  system: {
    getStats: () => ipcRenderer.invoke('system:getStats'),
    volumeUp: () => ipcRenderer.invoke('system:volumeUp'),
    volumeDown: () => ipcRenderer.invoke('system:volumeDown'),
    toggleMute: () => ipcRenderer.invoke('system:toggleMute')
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
