import { useEffect, useRef, useState } from 'react'
import {
  Check,
  FolderOpen,
  Gamepad2,
  Link2,
  Palette,
  RefreshCw,
  Settings as SettingsIcon,
  Trash2,
  TriangleAlert,
  Tv,
  X,
  type LucideIcon
} from 'lucide-react'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { KEY_ROWS, applyKey, clampKeyboardFocus } from '../components/onScreenKeyboardLayout'
import { useNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'
import { useNavigationStore } from '../state/navigationStore'
import { useThemeStore } from '../state/themeStore'
import { deriveThemeVars, hslToRgbTriplet, rgbTripletToHsl } from '../themes/colorUtils'
import { openThemesFolder, rescanThemesFolder } from '../themes/themeFolderActions'
import type { AddonSummary } from '@shared/stremioTypes'
import type { UpdateStatus } from '@shared/updateTypes'
import type { GlobalInputStatus } from '@shared/globalInputTypes'
import type { StartupSettings } from '@shared/settingsTypes'
import type { ThemeDefinition } from '@shared/themeTypes'

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
  { id: 'stremio', label: 'Stremio', icon: Tv }
]

type RowKind = 'header' | 'field' | 'action' | 'addon' | 'info' | 'theme'

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
  stremioEmail: 'Stremio Email',
  stremioPassword: 'Stremio Password',
  newAddon: 'Addon URL'
}

const CAPABILITY_LABELS: Record<string, string> = {
  stream: 'Stream',
  catalog: 'Catalog',
  meta: 'Meta',
  subtitles: 'Subtitles',
  addon_catalog: 'Addon Catalog'
}

function describeCapabilities(resources: string[]): string {
  return resources.map((r) => CAPABILITY_LABELS[r] ?? r).join(', ')
}

function header(id: string, label: string, category: string): SettingsRow {
  return { id, kind: 'header', label, category }
}

function describeSyncAge(lastSyncedAt: number | null): string {
  if (lastSyncedAt === null) return 'Never synced'
  const minutes = Math.round((Date.now() - lastSyncedAt) / 60000)
  if (minutes < 1) return 'Synced just now'
  if (minutes < 60) return `Synced ${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `Synced ${hours}h ago`
  return `Synced ${Math.round(hours / 24)}d ago`
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
  const [steamId64, setSteamId64] = useState('')
  const [stremioEmail, setStremioEmail] = useState('')
  const [stremioPassword, setStremioPassword] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [lastAddonsSyncedAt, setLastAddonsSyncedAt] = useState<number | null>(null)
  const [addons, setAddons] = useState<AddonSummary[]>([])
  const [appVersion, setAppVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [globalInputStatus, setGlobalInputStatus] = useState<GlobalInputStatus | null>(null)
  const [startupSettings, setStartupSettings] = useState<StartupSettings | null>(null)
  const [themesFolderPath, setThemesFolderPath] = useState('')

  const [zone, setZone] = useState<'sidebar' | 'content' | 'keyboard' | 'colorEditor' | 'confirmRemoveTheme'>(
    'sidebar'
  )
  const [categoryIndex, setCategoryIndex] = useState(0)
  const [menuIndex, setMenuIndex] = useState(0)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [kbRow, setKbRow] = useState(0)
  const [kbCol, setKbCol] = useState(0)
  const [kbValue, setKbValue] = useState('')
  const [kbShift, setKbShift] = useState(false)
  const [colorEditorTheme, setColorEditorTheme] = useState<ThemeDefinition | null>(null)
  const [colorEditorKeyIndex, setColorEditorKeyIndex] = useState(0)
  const [colorEditorChannel, setColorEditorChannel] = useState(0)
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
    window.api.settings
      .getStremio()
      .then((s) => {
        setAddons(s.addons)
        setLoggedIn(Boolean(s.authKey))
        setStremioEmail(s.email ?? '')
        setLastAddonsSyncedAt(s.lastAddonsSyncedAt)
      })
      .catch(() => {})
    window.api.updater.getVersion().then(setAppVersion).catch(() => {})
    window.api.updater.getStatus().then(setUpdateStatus).catch(() => {})
    window.api.globalInput.getStatus().then(setGlobalInputStatus).catch(() => {})
    window.api.settings.getStartup().then(setStartupSettings).catch(() => {})
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
          id: `editColors-${theme.id}`,
          kind: 'action',
          label: 'Fine-Tune Colors',
          category: 'appearance',
          icon: Palette
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

    header('stremioAccount', 'Stremio Account', 'stremio'),
    {
      id: 'stremioStatus',
      kind: 'info',
      category: 'stremio',
      label: loggedIn ? `Logged in as ${stremioEmail}` : 'Not logged in to Stremio',
      icon: loggedIn ? Check : undefined
    },
    ...(loggedIn
      ? [
          {
            id: 'stremioSyncAge',
            kind: 'info' as const,
            category: 'stremio',
            label: `Addon list: ${describeSyncAge(lastAddonsSyncedAt)} — auto-refreshes every few hours, or tap Re-sync below`
          }
        ]
      : []),
    { id: 'stremioEmail', kind: 'field', label: 'Stremio Email', category: 'stremio', value: stremioEmail },
    {
      id: 'stremioPassword',
      kind: 'field',
      label: 'Stremio Password',
      category: 'stremio',
      value: stremioPassword,
      masked: true
    },
    {
      id: 'stremioLogin',
      kind: 'action',
      category: 'stremio',
      label: loggedIn ? 'Re-sync Addons From Stremio Account' : 'Log In & Sync Addons'
    },
    ...(loggedIn
      ? [
          {
            id: 'importHistory',
            kind: 'action' as const,
            category: 'stremio',
            label: 'Import Watch History & Library From Stremio'
          }
        ]
      : []),

    header('stremioAddons', 'Stremio Addons', 'stremio'),
    ...addons.map(
      (addon, i): SettingsRow => ({
        id: `addon-${i}`,
        kind: 'addon',
        category: 'stremio',
        label: addon.name,
        value: describeCapabilities(addon.resources)
      })
    ),
    { id: 'addAddon', kind: 'action', label: '+ Add Addon URL', category: 'stremio' }
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
    } else if (field === 'stremioEmail') {
      setStremioEmail(value)
    } else if (field === 'stremioPassword') {
      setStremioPassword(value)
    } else if (field === 'newAddon' && value.trim()) {
      setMessage('Adding addon...')
      window.api.settings
        .addStremioAddon(value.trim())
        .then((next) => {
          setAddons(next)
          setMessage(`Added "${next[next.length - 1]?.name}"`)
        })
        .catch((error) => {
          setMessage(`Couldn't add addon: ${error instanceof Error ? error.message : String(error)}`)
        })
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

  async function doLogin(): Promise<void> {
    setMessage('Logging in to Stremio...')
    const result = await window.api.settings.stremioLogin(stremioEmail, stremioPassword)
    if (result.success) {
      setLoggedIn(true)
      setStremioPassword('')
      setMessage(`Logged in — synced ${result.addonsSynced} addon(s), all of them, not just stream ones`)
      const updated = await window.api.settings.getStremio()
      setAddons(updated.addons)
      setLastAddonsSyncedAt(updated.lastAddonsSyncedAt)
    } else {
      setMessage(`Login failed: ${result.error}`)
    }
  }

  // Stremio keeps Continue Watching and the Library page in one account-wide
  // collection — split here across our own separate progress/library stores.
  async function doImportHistory(): Promise<void> {
    setMessage('Importing watch history and library from Stremio...')
    const result = await window.api.settings.importStremioHistory()
    if (result.success) {
      setMessage(
        `Imported ${result.progressImported} in-progress title(s) and ${result.libraryImported} library title(s)`
      )
    } else {
      setMessage(`Import failed: ${result.error}`)
    }
  }

  // Uses the already-stored auth key — no need to retype the password just to
  // pick up newly-added addons or (e.g.) their catalog lists.
  async function doResync(): Promise<void> {
    setMessage('Re-syncing addons...')
    const result = await window.api.settings.resyncStremioAddons()
    if (result.success) {
      setMessage(`Re-synced ${result.addonsSynced} addon(s)`)
      const updated = await window.api.settings.getStremio()
      setAddons(updated.addons)
      setLastAddonsSyncedAt(updated.lastAddonsSyncedAt)
    } else {
      setMessage(`Re-sync failed: ${result.error}`)
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

  // Editing a theme's colors implicitly selects it first — the live preview
  // (colors apply to :root immediately on every adjustment) would otherwise
  // be previewing a theme that isn't even the one currently showing.
  function openColorEditor(theme: ThemeDefinition): void {
    if (themeId !== theme.id) setTheme(theme.id)
    setColorEditorTheme(theme)
    setColorEditorKeyIndex(0)
    setColorEditorChannel(0)
    setZone('colorEditor')
  }

  function closeColorEditor(): void {
    setZone('content')
    setColorEditorTheme(null)
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

  function adjustColor(direction: 1 | -1): void {
    if (!colorEditorTheme) return
    const colorKey = COLOR_KEYS[colorEditorKeyIndex].key
    const current = colorEditorTheme.vars[colorKey] ?? '128 128 128'
    const hsl = rgbTripletToHsl(current)
    if (colorEditorChannel === 0) hsl.h = ((hsl.h + direction * 4) % 360 + 360) % 360
    else if (colorEditorChannel === 1) hsl.s = Math.max(0, Math.min(100, hsl.s + direction * 3))
    else hsl.l = Math.max(0, Math.min(100, hsl.l + direction * 3))

    const newBaseVars = { ...colorEditorTheme.vars, [colorKey]: hslToRgbTriplet(hsl.h, hsl.s, hsl.l) }
    const newVars = deriveThemeVars(newBaseVars)
    const updated: ThemeDefinition = { ...colorEditorTheme, vars: newVars }
    setColorEditorTheme(updated)
    updateThemeVars(updated.id, newVars)
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
    } else if (row.id.startsWith('editColors-')) {
      const id = row.id.replace('editColors-', '')
      const theme = allThemes.find((t) => t.id === id)
      if (theme) openColorEditor(theme)
    } else if (row.id.startsWith('removeTheme-')) {
      const id = row.id.replace('removeTheme-', '')
      const theme = allThemes.find((t) => t.id === id)
      if (theme) openRemoveThemeConfirm(theme)
    } else if (row.kind === 'field') {
      openKeyboard(row.id, row.value ?? '')
    } else if (row.kind === 'addon') {
      const index = Number(row.id.replace('addon-', ''))
      const next = addons.filter((_, i) => i !== index)
      setAddons(next)
      window.api.settings.setStremioAddons(next)
      setMessage('Addon removed')
    } else if (row.id === 'addAddon') {
      openKeyboard('newAddon', '')
    } else if (row.id === 'steamSignIn') {
      void doSteamSignIn()
    } else if (row.id === 'stremioLogin') {
      if (loggedIn) void doResync()
      else void doLogin()
    } else if (row.id === 'importHistory') {
      void doImportHistory()
    } else if (row.id === 'checkForUpdates') {
      doCheckForUpdates()
    } else if (row.id === 'toggleStartup') {
      void doToggleStartup()
    } else if (row.id === 'openThemesFolder') {
      openThemesFolder()
    } else if (row.id === 'rescanThemesFolder') {
      void rescanThemesFolder(refreshCustomThemes, setMessage)
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

    if (zone === 'colorEditor') {
      switch (action) {
        case 'prevStream':
          setColorEditorKeyIndex((i) => (i === 0 ? COLOR_KEYS.length - 1 : i - 1))
          return
        case 'nextStream':
          setColorEditorKeyIndex((i) => (i + 1) % COLOR_KEYS.length)
          return
        case 'up':
          setColorEditorChannel((c) => (c === 0 ? 2 : c - 1))
          return
        case 'down':
          setColorEditorChannel((c) => (c + 1) % 3)
          return
        case 'left':
          adjustColor(-1)
          return
        case 'right':
          adjustColor(1)
          return
        case 'back':
        case 'menu':
        case 'confirm':
          closeColorEditor()
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
      <header>
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
                    ? loggedIn && row.id === 'stremioStatus'
                      ? 'bg-accent/20 text-accent ring-accent/30'
                      : 'bg-surface text-muted ring-accent/10'
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
                {row.kind === 'addon' && <span className="pl-4 text-xs text-muted">{row.value}</span>}
              </div>
            )
          })}
        </div>
      </div>

      <footer className="text-sm text-muted">{message}</footer>

      {zone === 'colorEditor' && colorEditorTheme && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="flex w-96 flex-col gap-4 rounded-2xl bg-surface p-8">
            <div className="flex items-center gap-3">
              <span
                className="h-10 w-10 shrink-0 rounded-full ring-1 ring-white/20"
                style={{
                  backgroundColor: `rgb(${colorEditorTheme.vars[COLOR_KEYS[colorEditorKeyIndex].key] ?? '128 128 128'})`
                }}
              />
              <div className="flex flex-col leading-tight">
                <span className="text-xs text-muted">{colorEditorTheme.name}</span>
                <span className="font-semibold">{COLOR_KEYS[colorEditorKeyIndex].label}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {CHANNEL_LABELS.map((label, i) => {
                const hsl = rgbTripletToHsl(
                  colorEditorTheme.vars[COLOR_KEYS[colorEditorKeyIndex].key] ?? '128 128 128'
                )
                const value = i === 0 ? hsl.h : i === 1 ? hsl.s : hsl.l
                const max = i === 0 ? 360 : 100
                return (
                  <div
                    key={label}
                    className={`flex flex-col gap-1 rounded-xl px-4 py-3 transition-colors ${
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
                    <div className="h-1.5 w-full rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-accent-gradient"
                        style={{ width: `${(value / max) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-xs text-muted">
              L1/R1: switch color · Up/Down: switch H/S/L · Left/Right: adjust · Back: done
            </p>
          </div>
        </div>
      )}

      {zone === 'confirmRemoveTheme' && themeToRemove && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="flex w-96 flex-col gap-4 rounded-2xl bg-surface p-8">
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
          masked={editingField === 'steamApiKey' || editingField === 'stremioPassword'}
          shift={kbShift}
          focusedRow={kbRow}
          focusedCol={kbCol}
          onChange={setKbValue}
          onSubmit={() => submitKeyboard(kbValue)}
          onCancel={cancelKeyboard}
          onKeyPress={pressVirtualKey}
        />
      )}
    </div>
  )
}
