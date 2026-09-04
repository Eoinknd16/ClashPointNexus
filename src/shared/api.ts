import type { MediaInfo } from './playerConstants'
import type { SteamSettings, StremioLoginResult, StremioSettings } from './settingsTypes'
import type { GameLaunchTarget, SteamLibraryResult } from './steamTypes'
import type { AddonSummary, CatalogItem, CatalogType, StreamResult } from './stremioTypes'
import type { ThemeDefinition } from './themeTypes'

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
    getCatalog: (type: CatalogType, catalogId: string) => Promise<CatalogItem[]>
    getStreams: (type: CatalogType, id: string) => Promise<StreamResult>
    getReleaseDate: (type: CatalogType, id: string) => Promise<string | null>
  }
  settings: {
    getSteam: () => Promise<SteamSettings>
    setSteam: (settings: SteamSettings) => Promise<void>
    getStremio: () => Promise<StremioSettings>
    setStremioAddons: (addons: AddonSummary[]) => Promise<void>
    addStremioAddon: (url: string) => Promise<AddonSummary[]>
    stremioLogin: (email: string, password: string) => Promise<StremioLoginResult>
    getCustomThemes: () => Promise<ThemeDefinition[]>
  }
  player: {
    probeMediaInfo: (url: string) => Promise<MediaInfo>
  }
  subtitles: {
    getTracks: (type: CatalogType, id: string) => Promise<SubtitleTrack[]>
  }
}
