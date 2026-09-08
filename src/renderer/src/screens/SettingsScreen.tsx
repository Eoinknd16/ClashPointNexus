import { useEffect, useRef, useState } from 'react'
import {
  Check,
  FolderOpen,
  Gamepad2,
  Link2,
  MonitorPlay,
  Palette,
  Plus,
  Puzzle,
  RefreshCw,
  Settings as SettingsIcon,
  Share2,
  Star,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon
} from 'lucide-react'
import { BackButton, CloseButton } from '../components/NavButtons'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { KEY_ROWS, applyKey, clampKeyboardFocus } from '../components/onScreenKeyboardLayout'
import { useNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'
import { useNavigationStore } from '../state/navigationStore'
import { useThemeStore } from '../state/themeStore'
import { deriveThemeVars, hslToRgbTriplet, rgbTripletToHsl } from '../themes/colorUtils'
import { openThemesFolder, rescanThemesFolder } from '../themes/themeFolderActions'
import { PluginHost } from '../plugins/PluginHost'
import { TvAddonsPanel } from '../plugins/TvAddonsPanel'
import type { UpdateStatus } from '@shared/updateTypes'
import type { GlobalInputStatus } from '@shared/globalInputTypes'
import type { InstalledPlugin } from '@shared/pluginTypes'
import type { StartupSettings } from '@shared/settingsTypes'
import { activeStyleOptionIndex, STYLE_AXES } from '@shared/themeStyle'
import { COMMUNITY_THEMES_REPO, type ThemeDefinition } from '@shared/themeTypes'
import { UI_SCALE_PRESETS } from '@shared/uiScale'

/** The 7 base colors a theme actually defines by hand — everything else
 * (--gradient-app-glow, --gradient-accent, --shadow-focus, --shadow-panel)
 * is mechanically derived from these (see colorUtils.ts's deriveThemeVars),
 * so the color picker only ever needs to expose these. */
const COLOR_KEYS: Array<{ key: string; label: string }> = [
  { key: '--color-bg', label: 'Background' },
  { key: '--color-surface', label: 'Surface' },
  { key: '--color-surface-hi', label: 'Surface (highlighted)' },
  { key: '--color-surface-hover', label: 'Surface (hover)' },
  { key: '--color-accent', label: 'Accent' },
  { key: '--color-accent-2', label: 'Accent 2' },
  { key: '--color-muted', label: 'Muted text' }
]
const CHANNEL_LABELS = ['Hue', 'Saturation', 'Lightness'] as const

/** Left-hand category rail — each row below belongs to exactly one of
 * these, so the content pane only ever shows one category at a time
 * instead of one long undifferentiated scrolling list. */
const CATEGORIES: Array<{ id: string; label: string; icon: LucideIcon }> = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'app', label: 'App', icon: SettingsIcon },
  { id: 'controller', label: 'Controller', icon: Gamepad2 },
  { id: 'steam', label: 'Steam', icon: Link2 },
  { id: 'plugins', label: 'Plugins', icon: Puzzle },
  { id: 'streaming', label: 'Streaming', icon: MonitorPlay },
  { id: 'ratings', label: 'Ratings', icon: Star }
]

type RowKind = 'header' | 'field' | 'action' | 'info' | 'theme'

interface SettingsRow {
  id: string
  kind: RowKind
  label: string
  /** One of CATEGORIES' ids — decides which sidebar category shows this row. */
  category: string
  value?: string
  masked?: boolean
  /** "R G B" space-separated, for the theme picker's swatch dot. */
  swatch?: string
  active?: boolean
  icon?: LucideIcon
}

const FIELD_LABELS: Record<string, string> = {
  steamApiKey: 'Steam API Key',
  steamId64: 'Steam ID64',
  omdbApiKey: 'OMDb API Key',
  tmdbApiKey: 'TMDb API Key',
  createThemeName: 'New Theme Name'
}

function header(id: string, label: string, category: string): SettingsRow {
  return { id, kind: 'header', label, category }
}

function updateActionLabel(status: UpdateStatus | null): string {
  if (!status) return 'Check for Updates'
  switch (status.state) {
    case 'checking':
      return 'Checking for updates...'
    case 'not-available':
      return 'Up to date'
    case 'downloading':
      return status.progressPercent != null
        ? `Downloading update... ${status.progressPercent}%`
        : 'Downloading update...'
    case 'downloaded':
      return `Restart to Install v${status.version}`
    case 'error':
      return 'Update check failed — tap to retry'
    case 'unsupported':
      return 'Updates unavailable in this build'
    default:
      return 'Check for Updates'
  }
}

export function SettingsScreen(): JSX.Element {
  const [steamApiKey, setSteamApiKey] = useState('')
  const [omdbApiKey, setOmdbApiKey] = useState('')
  const [tmdbApiKey, setTmdbApiKey] = useState('')
  const [steamId64, setSteamId64] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [globalInputStatus, setGlobalInputStatus] = useState<GlobalInputStatus | null>(null)
  const [startupSettings, setStartupSettings] = useState<StartupSettings | null>(null)
  const [themesFolderPath, setThemesFolderPath] = useState('')
  const [uiScale, setUiScaleState] = useState(1)
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([])
  const [runningPlugin, setRunningPlugin] = useState<{ id: string; name: string } | null>(null)

  const [zone, setZone] = useState<'sidebar' | 'content' | 'keyboard' | 'themeEditor' | 'confirmRemoveTheme'>(
    'sidebar'
  )
  const [categoryIndex, setCategoryIndex] = useState(0)
  const [menuIndex, setMenuIndex] = useState(0)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [kbRow, setKbRow] = useState(0)
  const [kbCol, setKbCol] = useState(0)
  const [kbValue, setKbValue] = useState('')
  const [kbShift, setKbShift] = useState(false)
  const [activePlugin, setActivePlugin] = useState<'tvAddons' | null>(null)
  const [themeEditorTheme, setThemeEditorTheme] = useState<ThemeDefinition | null>(null)
  const [editorTab, setEditorTab] = useState<'colors' | 'style'>('colors')
  const [colorEditorKeyIndex, setColorEditorKeyIndex] = useState(0)
  const [colorEditorChannel, setColorEditorChannel] = useState(0)
  const [styleAxisIndex, setStyleAxisIndex] = useState(0)
  const [themeToRemove, setThemeToRemove] = useState<ThemeDefinition | null>(null)
  const [removeConfirmIndex, setRemoveConfirmIndex] = useState(0)

  const message = useStatusStore((s) => s.message)
  const setMessage = useStatusStore((s) => s.setMessage)
  const goHome = useNavigationStore((s) => s.goHome)
  const allThemes = useThemeStore((s) => s.allThemes)
  const customThemes = useThemeStore((s) => s.customThemes)
  const themeId = useThemeStore((s) => s.themeId)
  const setTheme = useThemeStore((s) => s.setTheme)
  const refreshCustomThemes = useThemeStore((s) => s.refreshCustomThemes)
  const updateThemeVars = useThemeStore((s) => s.updateThemeVars)
  const removeTheme = useThemeStore((s) => s.removeTheme)
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])
  const customThemeIds = new Set(customThemes.map((t) => t.id))

  useEffect(() => {
    // A theme installed via File Manager's "Install as Theme" mid-session
    // won't show up here otherwise — themeStore only fetches custom themes
    // once, at app launch.
    void refreshCustomThemes()
    window.api.settings
      .getSteam()
      .then((s) => {
        setSteamApiKey(s.apiKey)
        setSteamId64(s.steamId64)
      })
      .catch(() => {})
    window.api.settings.getOmdbApiKey().then(setOmdbApiKey).catch(() => {})
    window.api.streaming.getApiKey().then(setTmdbApiKey).catch(() => {})
    window.api.updater.getVersion().then(setAppVersion).catch(() => {})
    window.api.updater.getStatus().then(setUpdateStatus).catch(() => {})
    window.api.globalInput.getStatus().then(setGlobalInputStatus).catch(() => {})
    window.api.settings.getStartup().then(setStartupSettings).catch(() => {})
    window.api.settings.getUiScale().then(setUiScaleState).catch(() => {})
    window.api.plugins.listInstalled().then(setInstalledPlugins).catch(() => {})
    window.api.settings.getThemesFolderPath().then(setThemesFolderPath).catch(() => {})
    // Mirrors status changes into the footer too — the row label alone is
    // easy to not notice changing in place.
    const unsubscribeUpdater = window.api.updater.onStatus((status) => {
      setUpdateStatus(status)
      if (status.state === 'not-available') setMessage('Already on the latest version')
      else if (status.state === 'downloaded') setMessage(`Update v${status.version} ready — tap to restart & install`)
      else if (status.state === 'error') setMessage(`Update check failed: ${status.error}`)
    })
    const unsubscribeGlobalInput = window.api.globalInput.onStatusChanged(setGlobalInputStatus)
    return () => {
      unsubscribeUpdater()
      unsubscribeGlobalInput()
    }
  }, [])

  const rows: SettingsRow[] = [
    ...allThemes.flatMap((theme): SettingsRow[] => {
      const themeRow: SettingsRow = {
        id: `theme-${theme.id}`,
        kind: 'theme',
        label: theme.name,
        category: 'appearance',
        swatch: theme.vars['--color-accent'],
        active: theme.id === themeId
      }
      // Only custom/installed themes are editable — built-ins are meant to
      // stay fixed reference points, and aren't tracked in
      // themes.config.json at all for this to persist against anyway.
      if (!customThemeIds.has(theme.id)) return [themeRow]
      return [
        themeRow,
        {
          id: `customizeTheme-${theme.id}`,
          kind: 'action',
          label: 'Customize Theme',
          category: 'appearance',
          icon: Palette
        },
        {
          id: `submitTheme-${theme.id}`,
          kind: 'action',
          label: 'Prepare Submission',
          category: 'appearance',
          icon: Share2
        },
        {
          id: `removeTheme-${theme.id}`,
          kind: 'action',
          label: 'Remove Theme',
          category: 'appearance',
          icon: Trash2
        }
      ]
    }),
    {
      id: 'createTheme',
      kind: 'action',
      label: 'Create New Theme',
      category: 'appearance',
      icon: Plus
    },
    header('themePacks', 'Custom Theme Packs', 'appearance'),
    {
      id: 'themesFolderPath',
      kind: 'info',
      category: 'appearance',
      label: themesFolderPath ? `Drop pack folders here: ${themesFolderPath}` : 'Locating Themes folder...'
    },
    { id: 'openThemesFolder', kind: 'action', label: 'Open Themes Folder', category: 'appearance', icon: FolderOpen },
    {
      id: 'rescanThemesFolder',
      kind: 'action',
      label: 'Rescan Themes Folder',
      category: 'appearance',
      icon: RefreshCw
    },

    { id: 'appVersion', kind: 'info', label: `Version ${appVersion}`, category: 'app' },
    {
      id: 'checkForUpdates',
      kind: 'action',
      label: updateActionLabel(updateStatus),
      category: 'app',
      icon: updateStatus?.state === 'not-available' ? Check : undefined
    },
    ...(startupSettings?.supported
      ? [
          {
            id: 'toggleStartup',
            kind: 'action' as const,
            label: 'Launch at Windows Startup',
            category: 'app',
            icon: startupSettings.enabled ? Check : undefined
          }
        ]
      : [
          {
            id: 'startupUnsupported',
            kind: 'info' as const,
            label: 'Launch at Startup unavailable in dev builds',
            category: 'app'
          }
        ]),
    {
      id: 'uiScale',
      kind: 'action',
      label: `UI Scale: ${Math.round(uiScale * 100)}% (press to cycle)`,
      category: 'app'
    },

    {
      id: 'globalInputCombos',
      kind: 'info',
      category: 'controller',
      label:
        'PS Button or hold L1+R1+Options: Quick Menu · L1+R1+Share: Mouse Mode · L1+R1+Square: Show Desktop'
    },
    {
      id: 'globalInputHelper',
      kind: 'info',
      category: 'controller',
      label: globalInputStatus?.helperRunning
        ? 'Background listener running'
        : 'Not running (packaged builds only, not npm run dev)',
      icon: globalInputStatus?.helperRunning ? Check : X
    },
    ...(globalInputStatus?.helperRunning
      ? [
          {
            id: 'globalInputController',
            kind: 'info' as const,
            category: 'controller',
            label:
              globalInputStatus.controllerConnected === true
                ? 'Controller detected'
                : globalInputStatus.controllerConnected === false
                  ? "No controller detected — check it's connected and Windows recognizes it as a game controller"
                  : 'Waiting for a reading...',
            icon:
              globalInputStatus.controllerConnected === true
                ? Check
                : globalInputStatus.controllerConnected === false
                  ? X
                  : undefined
          }
        ]
      : []),
    ...(globalInputStatus?.helperRunning
      ? [
          {
            id: 'hidPsButton',
            kind: 'info' as const,
            category: 'controller',
            label: globalInputStatus.hidPsButtonCaptureLive
              ? 'PS Button capture active'
              : globalInputStatus.hidPsButtonDiagnostic
                ? `PS Button capture: ${globalInputStatus.hidPsButtonDiagnostic}`
                : 'PS Button capture: waiting for controller data...',
            icon: globalInputStatus.hidPsButtonCaptureLive ? Check : undefined
          }
        ]
      : []),
    ...(globalInputStatus && globalInputStatus.restartCount > 0
      ? [
          {
            id: 'globalInputRestarts',
            kind: 'info' as const,
            category: 'controller',
            label: `Background listener has restarted ${globalInputStatus.restartCount} time(s) this session`,
            icon: TriangleAlert
          }
        ]
      : []),
    ...(globalInputStatus?.lastError
      ? [
          {
            id: 'globalInputError',
            kind: 'info' as const,
            category: 'controller',
            label: `Last error: ${globalInputStatus.lastError}`
          }
        ]
      : []),

    { id: 'steamApiKey', kind: 'field', label: 'Steam API Key', category: 'steam', value: steamApiKey, masked: true },
    { id: 'steamApiKeyHint', kind: 'info', label: 'Get one at steamcommunity.com/dev/apikey', category: 'steam' },
    {
      id: 'steamIdStatus',
      kind: 'info',
      category: 'steam',
      label: steamId64 ? `Linked to SteamID ${steamId64}` : 'Not linked to a Steam account',
      icon: steamId64 ? Check : undefined
    },
    {
      id: 'steamSignIn',
      kind: 'action',
      category: 'steam',
      label: steamId64 ? 'Re-link Steam Account' : 'Sign In With Steam'
    },
    { id: 'steamId64', kind: 'field', label: 'Steam ID64 (manual entry)', category: 'steam', value: steamId64 },

    header('pluginsHeader', 'Plugins', 'plugins'),
    {
      id: 'pluginsIntro',
      kind: 'info',
      category: 'plugins',
      label: 'Optional modules, managed separately from the core app — browse and install new ones from the Store.'
    },
    {
      id: 'openTvAddonsPlugin',
      kind: 'action',
      category: 'plugins',
      label: 'TV Addons — catalogs, streams & subtitles'
    },
    ...(installedPlugins.length === 0
      ? [
          {
            id: 'noInstalledPlugins',
            kind: 'info' as const,
            category: 'plugins',
            label: 'Nothing installed from the Plugin Store yet.'
          }
        ]
      : installedPlugins.flatMap((p) => [
          {
            id: `openInstalledPlugin-${p.manifest.id}`,
            kind: 'action' as const,
            category: 'plugins',
            label: `Open ${p.manifest.name}`
          },
          {
            id: `uninstallPlugin-${p.manifest.id}`,
            kind: 'action' as const,
            category: 'plugins',
            label: `Uninstall ${p.manifest.name}`
          }
        ])),

    header('whereToWatch', 'Where to Watch', 'streaming'),
    { id: 'tmdbApiKey', kind: 'field', label: 'TMDb API Key', category: 'streaming', value: tmdbApiKey, masked: true },
    {
      id: 'tmdbApiKeyHint',
      kind: 'info',
      category: 'streaming',
      label:
        'Optional — shows which official services (Netflix, Prime Video, Disney+...) carry a title, and opens ' +
        'them there when you pick one. Nexus never plays their content itself — DRM makes that legally off the ' +
        'table no matter who builds it. Get a free key at themoviedb.org/settings/api'
    },

    { id: 'omdbApiKey', kind: 'field', label: 'OMDb API Key', category: 'ratings', value: omdbApiKey, masked: true },
    {
      id: 'omdbApiKeyHint',
      kind: 'info',
      category: 'ratings',
      label: 'Optional — adds Rotten Tomatoes/Metacritic scores to movie & series detail pages. Get a free key at omdbapi.com/apikey.aspx'
    }
  ]

  const activeCategory = CATEGORIES[categoryIndex]
  const categoryRows = rows.filter((row) => row.category === activeCategory.id)

  // Headers are visual dividers, not stops — menuIndex indexes into this
  // filtered list of the current category's rows that can actually be focused.
  const selectableIndices = categoryRows.reduce<number[]>((acc, row, i) => {
    if (row.kind !== 'header') acc.push(i)
    return acc
  }, [])
  const clampedMenuIndex = Math.min(menuIndex, Math.max(0, selectableIndices.length - 1))
  const activeIndex = selectableIndices[clampedMenuIndex] ?? 0

  useEffect(() => {
    if (zone !== 'content') return
    rowRefs.current[activeIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, activeIndex])

  function openKeyboard(fieldId: string, initialValue: string): void {
    setEditingField(fieldId)
    setKbValue(initialValue)
    setKbShift(false)
    setKbRow(0)
    setKbCol(0)
    setZone('keyboard')
  }

  function commitField(field: string | null, value: string): void {
    if (!field) return
    // Trimmed defensively — a pasted key/id with a stray trailing newline or
    // space silently fails Steam's Web API with a 401, which is hard to spot.
    if (field === 'steamApiKey') {
      const trimmed = value.trim()
      setSteamApiKey(trimmed)
      window.api.settings.setSteam({ apiKey: trimmed, steamId64 })
      setMessage('Steam API key saved')
    } else if (field === 'steamId64') {
      const trimmed = value.trim()
      setSteamId64(trimmed)
      window.api.settings.setSteam({ apiKey: steamApiKey, steamId64: trimmed })
      setMessage('Steam ID64 saved')
    } else if (field === 'omdbApiKey') {
      const trimmed = value.trim()
      setOmdbApiKey(trimmed)
      window.api.settings.setOmdbApiKey(trimmed)
      setMessage('OMDb API key saved')
    } else if (field === 'tmdbApiKey') {
      const trimmed = value.trim()
      setTmdbApiKey(trimmed)
      window.api.streaming.setApiKey(trimmed)
      setMessage('TMDb API key saved')
    } else if (field === 'createThemeName') {
      void doCreateTheme(value)
    }
  }

  function submitKeyboard(finalValue: string): void {
    commitField(editingField, finalValue)
    setZone('content')
    setEditingField(null)
  }

  function cancelKeyboard(): void {
    setZone('content')
    setEditingField(null)
  }

  function pressVirtualKey(key: string): void {
    const result = applyKey(key, kbValue, kbShift)
    setKbValue(result.value)
    setKbShift(result.shift)
    if (result.done) submitKeyboard(result.value)
  }

  async function doSteamSignIn(): Promise<void> {
    setMessage('Opening Steam sign-in...')
    const result = await window.api.settings.steamSignIn()
    if (result.success && result.steamId64) {
      setSteamId64(result.steamId64)
      setMessage(`Linked to SteamID ${result.steamId64}`)
    } else {
      setMessage(`Steam sign-in failed: ${result.error}`)
    }
  }

  async function doToggleStartup(): Promise<void> {
    if (!startupSettings) return
    const next = !startupSettings.enabled
    setStartupSettings({ ...startupSettings, enabled: next })
    try {
      await window.api.settings.setStartupEnabled(next)
      setMessage(next ? 'Will launch automatically at Windows startup' : "Won't launch automatically anymore")
    } catch (error) {
      setStartupSettings({ ...startupSettings, enabled: !next })
      setMessage(`Couldn't update startup setting: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function doUninstallPlugin(id: string): Promise<void> {
    const plugin = installedPlugins.find((p) => p.manifest.id === id)
    await window.api.plugins.uninstall(id)
    setInstalledPlugins((prev) => prev.filter((p) => p.manifest.id !== id))
    setMessage(plugin ? `Uninstalled "${plugin.manifest.name}"` : 'Uninstalled')
  }

  async function doCycleUiScale(): Promise<void> {
    const currentIndex = UI_SCALE_PRESETS.indexOf(uiScale as (typeof UI_SCALE_PRESETS)[number])
    const next = UI_SCALE_PRESETS[(Math.max(0, currentIndex) + 1) % UI_SCALE_PRESETS.length]
    setUiScaleState(next)
    try {
      await window.api.settings.setUiScale(next)
      setMessage(`UI Scale set to ${Math.round(next * 100)}%`)
    } catch (error) {
      setUiScaleState(uiScale)
      setMessage(`Couldn't update UI Scale: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Editing a theme implicitly selects it first — every adjustment (color OR
  // style) applies to :root live, which would otherwise be previewing a
  // theme that isn't even the one currently showing.
  function openThemeEditor(theme: ThemeDefinition): void {
    if (themeId !== theme.id) setTheme(theme.id)
    setThemeEditorTheme(theme)
    setEditorTab('colors')
    setColorEditorKeyIndex(0)
    setColorEditorChannel(0)
    setStyleAxisIndex(0)
    setZone('themeEditor')
  }

  function closeThemeEditor(): void {
    setZone('content')
    setThemeEditorTheme(null)
  }

  // The Theme Editor's "Create New Theme" — makes a real, from-nothing
  // custom theme (not just a tweak of an installed pack), seeded from
  // whatever theme is currently active so there's something reasonable to
  // start tweaking from rather than a jarring reset to plain defaults.
  async function doCreateTheme(rawName: string): Promise<void> {
    const name = rawName.trim() || 'My Theme'
    const seedTheme = allThemes.find((t) => t.id === themeId)
    setMessage(`Creating ${name}...`)
    try {
      const created = await window.api.settings.createCustomTheme(name, seedTheme?.vars ?? {})
      await refreshCustomThemes()
      setTheme(created.id)
      setMessage(`Created ${created.name} — customize it below`)
      openThemeEditor(created)
    } catch (error) {
      setMessage(`Couldn't create theme: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function openRemoveThemeConfirm(theme: ThemeDefinition): void {
    setThemeToRemove(theme)
    setRemoveConfirmIndex(0)
    setZone('confirmRemoveTheme')
  }

  function closeRemoveThemeConfirm(): void {
    setZone('content')
    setThemeToRemove(null)
  }

  async function doRemoveTheme(): Promise<void> {
    if (!themeToRemove) return
    const { id, name } = themeToRemove
    setZone('content')
    setThemeToRemove(null)
    setMessage(`Removing ${name}...`)
    try {
      await removeTheme(id)
      setMessage(
        `Removed ${name} — if it came from your Themes folder, remove it from there too or it'll reinstall next scan`
      )
    } catch (error) {
      setMessage(`Couldn't remove ${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function doPrepareSubmission(theme: ThemeDefinition): Promise<void> {
    setMessage(`Preparing submission for ${theme.name}...`)
    try {
      const result = await window.api.settings.prepareThemeSubmission(theme.id)
      setMessage(
        result.success
          ? `Ready — opened the folder. Upload it to github.com/${COMMUNITY_THEMES_REPO.owner}/${COMMUNITY_THEMES_REPO.name}`
          : `Couldn't prepare submission: ${result.error}`
      )
    } catch (error) {
      setMessage(`Couldn't prepare submission: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Sets one HSL channel to an exact value — shared by adjustColor's D-pad
  // +/- steps and the mouse-facing <input type="range"> in the modal below,
  // so dragging a slider and nudging with L1/R1 both go through the same
  // single write path.
  function setColorChannelValue(channel: 0 | 1 | 2, newValue: number): void {
    if (!themeEditorTheme) return
    const colorKey = COLOR_KEYS[colorEditorKeyIndex].key
    const current = themeEditorTheme.vars[colorKey] ?? '128 128 128'
    const hsl = rgbTripletToHsl(current)
    if (channel === 0) hsl.h = newValue
    else if (channel === 1) hsl.s = newValue
    else hsl.l = newValue

    const newBaseVars = { ...themeEditorTheme.vars, [colorKey]: hslToRgbTriplet(hsl.h, hsl.s, hsl.l) }
    const newVars = deriveThemeVars(newBaseVars)
    const updated: ThemeDefinition = { ...themeEditorTheme, vars: newVars }
    setThemeEditorTheme(updated)
    updateThemeVars(updated.id, newVars)
  }

  function adjustColor(direction: 1 | -1): void {
    if (!themeEditorTheme) return
    const colorKey = COLOR_KEYS[colorEditorKeyIndex].key
    const hsl = rgbTripletToHsl(themeEditorTheme.vars[colorKey] ?? '128 128 128')
    if (colorEditorChannel === 0) setColorChannelValue(0, ((hsl.h + direction * 4) % 360 + 360) % 360)
    else if (colorEditorChannel === 1) setColorChannelValue(1, Math.max(0, Math.min(100, hsl.s + direction * 3)))
    else setColorChannelValue(2, Math.max(0, Math.min(100, hsl.l + direction * 3)))
  }

  // Jumps the active axis straight to one specific option — shared by
  // adjustStyle's D-pad +/- step and clicking a specific dot in the modal
  // below (which picks that exact option in one click rather than needing
  // to cycle to it).
  function selectStyleOption(axisIndex: number, optionIndex: number): void {
    if (!themeEditorTheme) return
    const axis = STYLE_AXES[axisIndex]
    const newBaseVars = { ...themeEditorTheme.vars, ...axis.options[optionIndex].vars }
    const newVars = deriveThemeVars(newBaseVars)
    const updated: ThemeDefinition = { ...themeEditorTheme, vars: newVars }
    setThemeEditorTheme(updated)
    updateThemeVars(updated.id, newVars)
  }

  // Style's counterpart to adjustColor — cycles the active axis (Typography,
  // Corner Roundness, Card Size, Spacing, Glow Intensity, Animation Style;
  // see shared/themeStyle.ts) to its next/previous curated option rather
  // than a raw numeric adjustment, same "pick from options that always look
  // good" philosophy as the rest of this editor.
  function adjustStyle(direction: 1 | -1): void {
    if (!themeEditorTheme) return
    const axis = STYLE_AXES[styleAxisIndex]
    const currentIndex = activeStyleOptionIndex(axis, themeEditorTheme.vars)
    const nextIndex = (currentIndex + direction + axis.options.length) % axis.options.length
    selectStyleOption(styleAxisIndex, nextIndex)
  }

  function doCheckForUpdates(): void {
    if (updateStatus?.state === 'downloaded') {
      void window.api.updater.quitAndInstall()
      return
    }
    if (updateStatus?.state === 'checking' || updateStatus?.state === 'downloading') return
    if (updateStatus?.state === 'unsupported') {
      setMessage('Updates only work in an installed/packaged build, not npm run dev')
      return
    }
    // Extra, harder-to-miss feedback beyond the row's own label — the row text
    // changing in place is easy to not notice.
    setMessage('Checking for updates...')
    void window.api.updater.check()
  }

  function activateRow(row: SettingsRow): void {
    if (row.kind === 'header' || row.kind === 'info') {
      return
    } else if (row.kind === 'theme') {
      const id = row.id.replace('theme-', '')
      setTheme(id)
      setMessage(`Theme set to ${row.label}`)
    } else if (row.id.startsWith('customizeTheme-')) {
      const id = row.id.replace('customizeTheme-', '')
      const theme = allThemes.find((t) => t.id === id)
      if (theme) openThemeEditor(theme)
    } else if (row.id.startsWith('submitTheme-')) {
      const id = row.id.replace('submitTheme-', '')
      const theme = allThemes.find((t) => t.id === id)
      if (theme) void doPrepareSubmission(theme)
    } else if (row.id.startsWith('removeTheme-')) {
      const id = row.id.replace('removeTheme-', '')
      const theme = allThemes.find((t) => t.id === id)
      if (theme) openRemoveThemeConfirm(theme)
    } else if (row.kind === 'field') {
      openKeyboard(row.id, row.value ?? '')
    } else if (row.id === 'steamSignIn') {
      void doSteamSignIn()
    } else if (row.id === 'openTvAddonsPlugin') {
      setActivePlugin('tvAddons')
    } else if (row.id.startsWith('openInstalledPlugin-')) {
      const id = row.id.replace('openInstalledPlugin-', '')
      const plugin = installedPlugins.find((p) => p.manifest.id === id)
      if (plugin) setRunningPlugin({ id, name: plugin.manifest.name })
    } else if (row.id.startsWith('uninstallPlugin-')) {
      const id = row.id.replace('uninstallPlugin-', '')
      void doUninstallPlugin(id)
    } else if (row.id === 'checkForUpdates') {
      doCheckForUpdates()
    } else if (row.id === 'toggleStartup') {
      void doToggleStartup()
    } else if (row.id === 'uiScale') {
      void doCycleUiScale()
    } else if (row.id === 'openThemesFolder') {
      openThemesFolder()
    } else if (row.id === 'rescanThemesFolder') {
      void rescanThemesFolder(refreshCustomThemes, setMessage)
    } else if (row.id === 'createTheme') {
      openKeyboard('createThemeName', '')
    }
  }

  useNavListener((action) => {
    if (zone === 'confirmRemoveTheme') {
      switch (action) {
        case 'left':
        case 'right':
          setRemoveConfirmIndex((i) => (i === 0 ? 1 : 0))
          return
        case 'confirm':
          if (removeConfirmIndex === 0) void doRemoveTheme()
          else closeRemoveThemeConfirm()
          return
        case 'back':
        case 'menu':
          closeRemoveThemeConfirm()
          return
        default:
          return
      }
    }

    if (zone === 'themeEditor') {
      switch (action) {
        // L2/R2 — the shoulder pair right next to L1/R1 (which cycle within
        // the Colors tab) switches between the two tabs themselves, rather
        // than reusing any of Up/Down/Left/Right, which already mean
        // "change channel"/"change axis" and "adjust value" inside each tab.
        case 'volumeDown':
          setEditorTab('colors')
          return
        case 'volumeUp':
          setEditorTab('style')
          return
        case 'prevStream':
          if (editorTab === 'colors') setColorEditorKeyIndex((i) => (i === 0 ? COLOR_KEYS.length - 1 : i - 1))
          return
        case 'nextStream':
          if (editorTab === 'colors') setColorEditorKeyIndex((i) => (i + 1) % COLOR_KEYS.length)
          return
        case 'up':
          if (editorTab === 'colors') setColorEditorChannel((c) => (c === 0 ? 2 : c - 1))
          else setStyleAxisIndex((i) => (i === 0 ? STYLE_AXES.length - 1 : i - 1))
          return
        case 'down':
          if (editorTab === 'colors') setColorEditorChannel((c) => (c + 1) % 3)
          else setStyleAxisIndex((i) => (i + 1) % STYLE_AXES.length)
          return
        case 'left':
          if (editorTab === 'colors') adjustColor(-1)
          else adjustStyle(-1)
          return
        case 'right':
          if (editorTab === 'colors') adjustColor(1)
          else adjustStyle(1)
          return
        case 'back':
        case 'menu':
        case 'confirm':
          closeThemeEditor()
          return
        default:
          return
      }
    }

    if (zone === 'keyboard') {
      switch (action) {
        case 'up': {
          const next = clampKeyboardFocus(kbRow - 1, kbCol)
          setKbRow(next.row)
          setKbCol(next.col)
          return
        }
        case 'down': {
          const next = clampKeyboardFocus(kbRow + 1, kbCol)
          setKbRow(next.row)
          setKbCol(next.col)
          return
        }
        case 'left':
          setKbCol((c) => Math.max(0, c - 1))
          return
        case 'right':
          setKbCol((c) => clampKeyboardFocus(kbRow, c + 1).col)
          return
        case 'confirm':
          pressVirtualKey(KEY_ROWS[kbRow][kbCol])
          return
        case 'toggleSubtitles':
          pressVirtualKey('BACKSPACE')
          return
        case 'volumeUp':
          pressVirtualKey('SHIFT')
          return
        case 'nextStream':
          submitKeyboard(kbValue)
          return
        case 'back':
        case 'menu':
          cancelKeyboard()
          return
        default:
          return
      }
    }

    if (zone === 'sidebar') {
      switch (action) {
        case 'up':
          setCategoryIndex((i) => Math.max(0, i - 1))
          setMenuIndex(0)
          return
        case 'down':
          setCategoryIndex((i) => Math.min(CATEGORIES.length - 1, i + 1))
          setMenuIndex(0)
          return
        case 'right':
        case 'confirm':
          setZone('content')
          return
        case 'back':
        case 'menu':
          goHome()
          return
        default:
          return
      }
    }

    // zone === 'content'
    switch (action) {
      case 'up':
        setMenuIndex((i) => Math.max(0, i - 1))
        return
      case 'down':
        setMenuIndex((i) => Math.min(selectableIndices.length - 1, i + 1))
        return
      case 'confirm': {
        const row = categoryRows[activeIndex]
        if (row) activateRow(row)
        return
      }
      case 'left':
      case 'back':
      case 'menu':
        setZone('sidebar')
        return
      default:
        return
    }
  }, 'settings')

  return (
    <div className="flex h-screen flex-col gap-6 bg-bg px-10 py-8">
      <header className="flex items-center gap-4">
        <BackButton label="Home" onClick={goHome} />
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </header>

      <div className="flex flex-1 gap-8 overflow-hidden">
        {/* p-2: this row sets overflow-hidden, which per spec clips at its
            OWN box edge regardless of the page shell's own px-10/py-8 —
            without room reserved here too, a focused row's shadow-focus
            glow gets sliced off flush against this container's boundary
            (see CategoryRow.tsx's identical fix for the original instance
            of this). */}
        <nav className="flex w-60 shrink-0 flex-col gap-1.5 p-5">
          {CATEGORIES.map((cat, i) => {
            const isCurrentCategory = i === categoryIndex
            const isFocused = zone === 'sidebar' && isCurrentCategory
            return (
              <div
                key={cat.id}
                onClick={() => {
                  setCategoryIndex(i)
                  setMenuIndex(0)
                  setZone('content')
                }}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 font-medium transition-colors ${
                  isFocused
                    ? 'bg-surface-hi text-accent shadow-focus ring-2 ring-accent'
                    : isCurrentCategory
                      ? 'bg-surface-hi text-accent'
                      : 'text-muted hover:bg-surface'
                }`}
              >
                <cat.icon className="h-4 w-4 shrink-0" />
                {cat.label}
              </div>
            )
          })}
        </nav>

        <div className="w-px shrink-0 bg-surface-hover" />

        <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-5">
          <h2 className="mb-2 px-1 text-lg font-bold tracking-tight">{activeCategory.label}</h2>
          {categoryRows.map((row, i) => {
            if (row.kind === 'header') {
              return (
                <h3
                  key={row.id}
                  className="mb-1 mt-4 px-1 text-xs font-bold uppercase tracking-wider text-muted first:mt-0"
                >
                  {row.label}
                </h3>
              )
            }
            return (
              <div
                key={row.id}
                ref={(el) => (rowRefs.current[i] = el)}
                onClick={() => {
                  setZone('content')
                  setMenuIndex(selectableIndices.indexOf(i))
                  activateRow(row)
                }}
                className={`mb-2 flex items-center justify-between rounded-xl px-5 py-4 ring-1 transition-colors ${
                  row.kind === 'info' ? '' : 'cursor-pointer'
                } ${
                  row.kind === 'info'
                    ? 'bg-surface text-muted ring-accent/10'
                    : zone === 'content' && activeIndex === i
                      ? 'bg-surface-hi shadow-focus ring-2 ring-accent'
                      : 'bg-surface ring-accent/15'
                }`}
              >
                <span className="flex items-center gap-3 font-medium">
                  {row.kind === 'theme' && row.swatch && (
                    <span
                      className="h-4 w-4 shrink-0 rounded-full ring-1 ring-white/20"
                      style={{ backgroundColor: `rgb(${row.swatch})` }}
                    />
                  )}
                  {row.icon && <row.icon className="h-4 w-4 shrink-0" />}
                  {row.label}
                  {row.kind === 'theme' && row.active && <Check className="h-4 w-4 text-accent" />}
                </span>
                {row.kind === 'field' && (
                  <span className="text-muted">
                    {row.value
                      ? row.masked
                        ? '•'.repeat(Math.min(row.value.length, 12))
                        : row.value
                      : 'Not set'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <footer className="text-sm text-muted">{message}</footer>

      {zone === 'themeEditor' && themeEditorTheme && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70" onClick={closeThemeEditor}>
          <div
            onClick={(event) => event.stopPropagation()}
            className="relative flex w-[30rem] flex-col gap-4 rounded-panel bg-surface p-8"
          >
            <CloseButton className="absolute right-4 top-4" onClick={closeThemeEditor} />
            <div className="flex items-center justify-between pr-8">
              <span className="font-semibold">{themeEditorTheme.name}</span>
              <div className="flex gap-1.5 rounded-full bg-surface-hover p-1">
                {(['colors', 'style'] as const).map((tab) => (
                  <span
                    key={tab}
                    onClick={() => setEditorTab(tab)}
                    className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                      editorTab === tab ? 'bg-accent text-white' : 'text-muted hover:text-white'
                    }`}
                  >
                    {tab}
                  </span>
                ))}
              </div>
            </div>

            {editorTab === 'colors' ? (
              <>
                <div className="flex items-center gap-2">
                  {COLOR_KEYS.map((colorKey, i) => (
                    <span
                      key={colorKey.key}
                      onClick={() => setColorEditorKeyIndex(i)}
                      title={colorKey.label}
                      className={`h-8 w-8 shrink-0 cursor-pointer rounded-full ring-2 transition-all ${
                        colorEditorKeyIndex === i ? 'ring-accent' : 'ring-white/10 hover:ring-white/30'
                      }`}
                      style={{ backgroundColor: `rgb(${themeEditorTheme.vars[colorKey.key] ?? '128 128 128'})` }}
                    />
                  ))}
                </div>
                <span className="-mt-2 text-sm font-semibold text-muted">
                  {COLOR_KEYS[colorEditorKeyIndex].label}
                </span>

                <div className="flex flex-col gap-3">
                  {CHANNEL_LABELS.map((label, i) => {
                    const hsl = rgbTripletToHsl(
                      themeEditorTheme.vars[COLOR_KEYS[colorEditorKeyIndex].key] ?? '128 128 128'
                    )
                    const value = i === 0 ? hsl.h : i === 1 ? hsl.s : hsl.l
                    const max = i === 0 ? 360 : 100
                    return (
                      <div
                        key={label}
                        onClick={() => setColorEditorChannel(i)}
                        className={`flex cursor-pointer flex-col gap-1.5 rounded-xl px-4 py-3 transition-colors ${
                          colorEditorChannel === i ? 'bg-surface-hi ring-2 ring-accent' : 'bg-surface-hover'
                        }`}
                      >
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted">{label}</span>
                          <span className="font-semibold">
                            {Math.round(value)}
                            {i === 0 ? '°' : '%'}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={max}
                          step={1}
                          value={value}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            setColorEditorChannel(i)
                            setColorChannelValue(i as 0 | 1 | 2, Number(event.target.value))
                          }}
                          className="h-1.5 w-full cursor-pointer accent-accent"
                        />
                      </div>
                    )
                  })}
                </div>

                <p className="text-xs text-muted">
                  L1/R1: switch color · Up/Down: switch H/S/L · Left/Right: adjust · L2/R2: switch tab · Back: done
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {STYLE_AXES.map((axis, i) => {
                    const optionIndex = activeStyleOptionIndex(axis, themeEditorTheme.vars)
                    const option = axis.options[optionIndex]
                    return (
                      <div
                        key={axis.key}
                        onClick={() => setStyleAxisIndex(i)}
                        className={`flex cursor-pointer flex-col gap-1.5 rounded-xl px-4 py-3 transition-colors ${
                          styleAxisIndex === i ? 'bg-surface-hi ring-2 ring-accent' : 'bg-surface-hover'
                        }`}
                      >
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted">{axis.label}</span>
                          <span className="font-semibold">{option.label}</span>
                        </div>
                        <div className="flex gap-1">
                          {axis.options.map((opt, optIndex) => (
                            <span
                              key={opt.id}
                              title={opt.label}
                              onClick={(event) => {
                                event.stopPropagation()
                                setStyleAxisIndex(i)
                                selectStyleOption(i, optIndex)
                              }}
                              className={`h-2.5 flex-1 cursor-pointer rounded-full transition-transform hover:scale-y-150 ${
                                optIndex === optionIndex ? 'bg-accent-gradient' : 'bg-white/10'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <p className="text-xs text-muted">
                  {STYLE_AXES[styleAxisIndex].hint} · Click a dot to pick it directly · L2/R2: switch tab · Back: done
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {zone === 'confirmRemoveTheme' && themeToRemove && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="flex w-96 flex-col gap-4 rounded-panel bg-surface p-8">
            <h2 className="text-lg font-semibold">Remove theme "{themeToRemove.name}"?</h2>
            <p className="text-sm text-muted">
              {themeToRemove.id === themeId
                ? "This is your active theme — removing it switches you back to Default. "
                : ''}
              If it came from your Themes folder, remove it from there too, or it'll be reinstalled the
              next time the app scans that folder.
            </p>
            <div className="flex gap-3">
              {['Remove', 'Cancel'].map((label, i) => (
                <div
                  key={label}
                  onClick={() => {
                    setRemoveConfirmIndex(i)
                    if (i === 0) void doRemoveTheme()
                    else closeRemoveThemeConfirm()
                  }}
                  className={`flex-1 cursor-pointer rounded-xl px-5 py-3 text-center font-medium transition-colors ${
                    removeConfirmIndex === i ? 'bg-accent text-white' : 'bg-surface-hi text-muted'
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {zone === 'keyboard' && (
        <OnScreenKeyboard
          label={editingField ? (FIELD_LABELS[editingField] ?? '') : ''}
          value={kbValue}
          masked={
            editingField === 'steamApiKey' || editingField === 'omdbApiKey' || editingField === 'tmdbApiKey'
          }
          shift={kbShift}
          focusedRow={kbRow}
          focusedCol={kbCol}
          onChange={setKbValue}
          onSubmit={() => submitKeyboard(kbValue)}
          onCancel={cancelKeyboard}
          onKeyPress={pressVirtualKey}
        />
      )}

      {activePlugin === 'tvAddons' && <TvAddonsPanel onClose={() => setActivePlugin(null)} />}
      {runningPlugin && (
        <PluginHost
          pluginId={runningPlugin.id}
          pluginName={runningPlugin.name}
          onClose={() => setRunningPlugin(null)}
        />
      )}
    </div>
  )
}
