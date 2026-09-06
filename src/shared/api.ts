import type { AppEntry } from './appsTypes'
import type { HighScoreEntry, ScoreSubmitResult } from './arcadeTypes'
import type { DirectoryListing, FileEntry } from './filesystemTypes'
import type { GlobalInputStatus } from './globalInputTypes'
import type { ContinueSuggestion } from './homeTypes'
import type { LibraryEntry } from './libraryTypes'
import type { MediaInfo } from './playerConstants'
import type { WatchProgress } from './progressTypes'
import type {
  SteamSettings,
  SteamSignInResult,
  StartupSettings,
  StremioImportResult,
  StremioLoginResult,
  StremioSettings
} from './settingsTypes'
import type { AchievementProgress, GameLaunchTarget, GameStoreInfo, SteamLibraryResult } from './steamTypes'
import type { SystemStats } from './systemTypes'
import type {
  AddonCatalogRow,
  AddonSummary,
  CatalogItem,
  CatalogType,
  SeriesMeta,
  StreamResult
} from './stremioTypes'
import type {
  CommunityThemeSummary,
  ThemeDefinition,
  ThemeInstallResult,
  ThemeScanResult,
  ThemeSubmissionResult
} from './themeTypes'
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
    /** Resolves to the new favorited state. */
    toggleFavorite: (id: string) => Promise<boolean>
    /** Null covers every "not applicable" case (no achievements schema, private stats, no API key configured) alike. */
    getAchievements: (appId: number) => Promise<AchievementProgress | null>
    /** Steam's public storefront API — no key/account needed. */
    getStoreInfo: (appId: number) => Promise<GameStoreInfo | null>
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
    /** Opens a real Steam login window and captures the SteamID64 from a
     * verified OpenID callback — an API key still has to be entered manually
     * (Steam's Web API always requires one), but this removes needing to
     * look up your own 17-digit SteamID64. */
    steamSignIn: () => Promise<SteamSignInResult>
    getStremio: () => Promise<StremioSettings>
    setStremioAddons: (addons: AddonSummary[]) => Promise<void>
    addStremioAddon: (url: string) => Promise<AddonSummary[]>
    stremioLogin: (email: string, password: string) => Promise<StremioLoginResult>
    resyncStremioAddons: () => Promise<StremioLoginResult>
    importStremioHistory: () => Promise<StremioImportResult>
    getCustomThemes: () => Promise<ThemeDefinition[]>
    /** folderPath must contain a theme.json plus whatever image files it
     * references — see themeInstall.ts. Reached from File Manager's
     * "Install as Theme" action, never a native file dialog. */
    installTheme: (folderPath: string) => Promise<ThemeInstallResult>
    /** Patches one custom theme's vars — the in-app color picker. No-ops
     * silently if id isn't a known custom theme (built-ins aren't tracked
     * server-side at all). */
    updateThemeVars: (id: string, vars: Record<string, string>) => Promise<void>
    /** Scans the Themes drop folder for pack subfolders not yet installed —
     * already runs once at app startup, this is for picking up a folder
     * dropped in mid-session without restarting. */
    scanThemesFolder: () => Promise<ThemeScanResult>
    /** Absolute path to the Themes drop folder, for display only (e.g. a
     * hint row in Settings) — actually opening it is openThemesFolder. */
    getThemesFolderPath: () => Promise<string>
    /** Opens the Themes drop folder in the OS file explorer. */
    openThemesFolder: () => Promise<void>
    /** Custom/installed themes only — no-ops for a built-in id (Settings'
     * UI never offers this action on one). Only deletes this app's own
     * copied assets, not the original pack folder if it came from the
     * Themes drop folder — that'll reinstall it on the next scan unless
     * the user also removes/renames the source folder. */
    removeTheme: (id: string) => Promise<void>
    /** Lists what's currently in the public community theme repo — read-only,
     * anonymous, best-effort (an unreachable repo just means an empty list). */
    listCommunityThemes: () => Promise<CommunityThemeSummary[]>
    /** Downloads and installs one theme from the community repo by its
     * folder name — a no-op returning the existing theme if it's already
     * installed (id is deterministic from the folder name). */
    installCommunityTheme: (folder: string) => Promise<ThemeInstallResult>
    /** Packages a custom/installed theme into a shareable folder (colors +
     * images, shaped like a Themes drop-folder pack) and opens it in the OS
     * file explorer — the user uploads it to the community repo themselves. */
    prepareThemeSubmission: (id: string) => Promise<ThemeSubmissionResult>
    getStartup: () => Promise<StartupSettings>
    /** No-ops in a dev build — see StartupSettings.supported. */
    setStartupEnabled: (enabled: boolean) => Promise<void>
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
  globalInput: {
    /** Whether the background XInput watcher currently has system-wide mouse
     * control active — unsupported (always resolves false) in a dev build,
     * where the watcher never starts. */
    getMouseModeStatus: () => Promise<boolean>
    toggleMouseMode: () => Promise<void>
    /** Sends Nexus to the background (minimize, dropping fullscreen first)
     * so the real Windows desktop/taskbar/other windows are visible and
     * clickable via Mouse Mode's already-global cursor control — calling it
     * again restores and refocuses Nexus, without ever quitting it. */
    goToDesktop: () => Promise<void>
    /** Whether the helper process is running at all and whether XInput sees
     * a controller — added after a real-world report of Mouse Mode not
     * working with no way to tell why (XInput only recognizes Xbox
     * controllers and things explicitly remapped to emulate one; a
     * DualSense/DualShock plugged in directly won't register here even
     * though the rest of the app's Gamepad-API-based nav reads it fine). */
    getStatus: () => Promise<GlobalInputStatus>
    onStatusChanged: (callback: (status: GlobalInputStatus) => void) => () => void
    /** Returns an unsubscribe function. */
    onMouseModeChanged: (callback: (active: boolean) => void) => () => void
    /** Fired when the physical L1+R1+Start combo is held outside the app —
     * the main process has already brought the window to the foreground by
     * the time this fires; the listener just needs to open the Quick Menu. */
    onOpenQuickMenu: (callback: () => void) => () => void
  }
  apps: {
    list: () => Promise<AppEntry[]>
    add: (name: string, executablePath: string, args: string) => Promise<AppEntry>
    remove: (id: string) => Promise<void>
    /** Resolves to the new favorited state. */
    toggleFavorite: (id: string) => Promise<boolean>
    /** Resolves to an error message on failure, null on success. */
    launch: (executablePath: string, args: string) => Promise<string | null>
  }
  arcade: {
    getHighScores: () => Promise<HighScoreEntry[]>
    /** Local-only leaderboard for now — see arcadeTypes.ts. */
    submitScore: (name: string, score: number) => Promise<ScoreSubmitResult>
  }
}
