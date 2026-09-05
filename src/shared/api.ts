import type { DirectoryListing, FileEntry } from './filesystemTypes'
import type { ContinueSuggestion } from './homeTypes'
import type { LibraryEntry } from './libraryTypes'
import type { MediaInfo } from './playerConstants'
import type { WatchProgress } from './progressTypes'
import type {
  SteamSettings,
  StremioImportResult,
  StremioLoginResult,
  StremioSettings
} from './settingsTypes'
import type { GameLaunchTarget, SteamLibraryResult } from './steamTypes'
import type { SystemStats } from './systemTypes'
import type {
  AddonCatalogRow,
  AddonSummary,
  CatalogItem,
  CatalogType,
  SeriesMeta,
  StreamResult
} from './stremioTypes'
import type { ThemeDefinition } from './themeTypes'
import type { UpdateStatus } from './updateTypes'
import type { WeatherData } from './weatherTypes'

export interface SubtitleTrack {
  id: string
  lang: string
  url: string
}

export interface LauncherApi {
  steam: {
    getLibrary: () => Promise<SteamLibraryResult>
    launch: (target: GameLaunchTarget) => Promise<void>
    install: (appId: number) => Promise<void>
  }
  stremio: {
    getCatalog: (type: CatalogType, catalogId: string, skip?: number, genre?: string) => Promise<CatalogItem[]>
    getStreams: (type: CatalogType, id: string) => Promise<StreamResult>
    getReleaseDate: (type: CatalogType, id: string) => Promise<string | null>
    getSeriesMeta: (id: string) => Promise<SeriesMeta>
    getContinueWatching: (type: CatalogType) => Promise<CatalogItem[]>
    getAddonCatalogs: (type: CatalogType) => Promise<AddonCatalogRow[]>
    search: (type: CatalogType, query: string) => Promise<CatalogItem[]>
  }
  progress: {
    get: (type: CatalogType, id: string) => Promise<WatchProgress | null>
    save: (entry: WatchProgress) => Promise<void>
    clear: (type: CatalogType, id: string) => Promise<void>
  }
  library: {
    list: () => Promise<LibraryEntry[]>
    has: (type: CatalogType, id: string) => Promise<boolean>
    add: (entry: Omit<LibraryEntry, 'addedAt'>) => Promise<void>
    remove: (type: CatalogType, id: string) => Promise<void>
  }
  settings: {
    getSteam: () => Promise<SteamSettings>
    setSteam: (settings: SteamSettings) => Promise<void>
    getStremio: () => Promise<StremioSettings>
    setStremioAddons: (addons: AddonSummary[]) => Promise<void>
    addStremioAddon: (url: string) => Promise<AddonSummary[]>
    stremioLogin: (email: string, password: string) => Promise<StremioLoginResult>
    resyncStremioAddons: () => Promise<StremioLoginResult>
    importStremioHistory: () => Promise<StremioImportResult>
    getCustomThemes: () => Promise<ThemeDefinition[]>
  }
  player: {
    probeMediaInfo: (url: string) => Promise<MediaInfo>
  }
  subtitles: {
    getTracks: (type: CatalogType, id: string) => Promise<SubtitleTrack[]>
  }
  updater: {
    getStatus: () => Promise<UpdateStatus>
    getVersion: () => Promise<string>
    check: () => Promise<void>
    quitAndInstall: () => Promise<void>
    /** Returns an unsubscribe function. */
    onStatus: (callback: (status: UpdateStatus) => void) => () => void
  }
  filesystem: {
    listDrives: () => Promise<FileEntry[]>
    listDirectory: (dirPath: string) => Promise<DirectoryListing>
    getParentPath: (dirPath: string) => Promise<string | null>
    getHomeDirectory: () => Promise<string>
    openPath: (targetPath: string) => Promise<string | null>
    /** All four resolve to an error message on failure, null on success. */
    rename: (targetPath: string, newName: string) => Promise<string | null>
    delete: (targetPath: string) => Promise<string | null>
    createFolder: (parentDir: string, name: string) => Promise<string | null>
    copy: (sourcePath: string, destDir: string) => Promise<string | null>
    move: (sourcePath: string, destDir: string) => Promise<string | null>
  }
  power: {
    sleep: () => Promise<void>
    restart: () => Promise<void>
    shutdown: () => Promise<void>
    quitApp: () => Promise<void>
  }
  weather: {
    get: () => Promise<WeatherData | null>
  }
  home: {
    getContinueSuggestion: () => Promise<ContinueSuggestion | null>
  }
  system: {
    getStats: () => Promise<SystemStats>
    volumeUp: () => Promise<void>
    volumeDown: () => Promise<void>
    toggleMute: () => Promise<void>
  }
}
