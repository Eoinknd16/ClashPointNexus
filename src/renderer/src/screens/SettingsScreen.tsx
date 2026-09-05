import { useEffect, useRef, useState } from 'react'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { KEY_ROWS, applyKey, clampKeyboardFocus } from '../components/onScreenKeyboardLayout'
import { useNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'
import { useNavigationStore } from '../state/navigationStore'
import { useThemeStore } from '../state/themeStore'
import type { AddonSummary } from '@shared/stremioTypes'
import type { UpdateStatus } from '@shared/updateTypes'
import type { GlobalInputStatus } from '@shared/globalInputTypes'
import type { StartupSettings } from '@shared/settingsTypes'

type RowKind = 'header' | 'field' | 'action' | 'addon' | 'info' | 'theme'

interface SettingsRow {
  id: string
  kind: RowKind
  label: string
  value?: string
  masked?: boolean
  /** "R G B" space-separated, for the theme picker's swatch dot. */
  swatch?: string
  active?: boolean
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

function header(id: string, label: string): SettingsRow {
  return { id, kind: 'header', label }
}

function updateActionLabel(status: UpdateStatus | null): string {
  if (!status) return 'Check for Updates'
  switch (status.state) {
    case 'checking':
      return 'Checking for updates...'
    case 'not-available':
      return '✓ Up to date'
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
  const [addons, setAddons] = useState<AddonSummary[]>([])
  const [appVersion, setAppVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [globalInputStatus, setGlobalInputStatus] = useState<GlobalInputStatus | null>(null)
  const [startupSettings, setStartupSettings] = useState<StartupSettings | null>(null)

  const [zone, setZone] = useState<'menu' | 'keyboard'>('menu')
  const [menuIndex, setMenuIndex] = useState(0)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [kbRow, setKbRow] = useState(0)
  const [kbCol, setKbCol] = useState(0)
  const [kbValue, setKbValue] = useState('')
  const [kbShift, setKbShift] = useState(false)

  const message = useStatusStore((s) => s.message)
  const setMessage = useStatusStore((s) => s.setMessage)
  const goHome = useNavigationStore((s) => s.goHome)
  const allThemes = useThemeStore((s) => s.allThemes)
  const themeId = useThemeStore((s) => s.themeId)
  const setTheme = useThemeStore((s) => s.setTheme)
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
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
      })
      .catch(() => {})
    window.api.updater.getVersion().then(setAppVersion).catch(() => {})
    window.api.updater.getStatus().then(setUpdateStatus).catch(() => {})
    window.api.globalInput.getStatus().then(setGlobalInputStatus).catch(() => {})
    window.api.settings.getStartup().then(setStartupSettings).catch(() => {})
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
    header('appearance', 'Appearance'),
    ...allThemes.map(
      (theme): SettingsRow => ({
        id: `theme-${theme.id}`,
        kind: 'theme',
        label: theme.name,
        swatch: theme.vars['--color-accent'],
        active: theme.id === themeId
      })
    ),

    header('app', 'App'),
    { id: 'appVersion', kind: 'info', label: `Version ${appVersion}` },
    { id: 'checkForUpdates', kind: 'action', label: updateActionLabel(updateStatus) },
    ...(startupSettings?.supported
      ? [
          {
            id: 'toggleStartup',
            kind: 'action' as const,
            label: startupSettings.enabled
              ? '✓ Launch at Windows Startup'
              : 'Launch at Windows Startup'
          }
        ]
      : [
          {
            id: 'startupUnsupported',
            kind: 'info' as const,
            label: 'Launch at Startup unavailable in dev builds'
          }
        ]),

    header('globalInput', 'Global Controller Input (works outside the app too)'),
    {
      id: 'globalInputCombos',
      kind: 'info',
      label:
        'PS Button or hold L1+R1+Options: Quick Menu · L1+R1+Share: Mouse Mode · L1+R1+Square: Show Desktop'
    },
    {
      id: 'globalInputHelper',
      kind: 'info',
      label: globalInputStatus?.helperRunning
        ? '✓ Background listener running'
        : '✗ Not running (packaged builds only, not npm run dev)'
    },
    ...(globalInputStatus?.helperRunning
      ? [
          {
            id: 'globalInputController',
            kind: 'info' as const,
            label:
              globalInputStatus.controllerConnected === true
                ? '✓ Controller detected'
                : globalInputStatus.controllerConnected === false
                  ? '✗ No controller detected — check it\'s connected and Windows recognizes it as a game controller'
                  : 'Waiting for a reading...'
          }
        ]
      : []),
    ...(globalInputStatus?.helperRunning
      ? [
          {
            id: 'hidPsButton',
            kind: 'info' as const,
            label: globalInputStatus.hidPsButtonCaptureLive
              ? '✓ PS Button capture active'
              : globalInputStatus.hidPsButtonDiagnostic
                ? `PS Button capture: ${globalInputStatus.hidPsButtonDiagnostic}`
                : 'PS Button capture: waiting for controller data...'
          }
        ]
      : []),
    ...(globalInputStatus && globalInputStatus.restartCount > 0
      ? [
          {
            id: 'globalInputRestarts',
            kind: 'info' as const,
            label: `⚠ Background listener has restarted ${globalInputStatus.restartCount} time(s) this session`
          }
        ]
      : []),
    ...(globalInputStatus?.lastError
      ? [{ id: 'globalInputError', kind: 'info' as const, label: `Last error: ${globalInputStatus.lastError}` }]
      : []),

    header('steam', 'Steam'),
    { id: 'steamApiKey', kind: 'field', label: 'Steam API Key', value: steamApiKey, masked: true },
    { id: 'steamApiKeyHint', kind: 'info', label: 'Get one at steamcommunity.com/dev/apikey' },
    {
      id: 'steamIdStatus',
      kind: 'info',
      label: steamId64 ? `✓ Linked to SteamID ${steamId64}` : 'Not linked to a Steam account'
    },
    { id: 'steamSignIn', kind: 'action', label: steamId64 ? 'Re-link Steam Account' : 'Sign In With Steam' },
    { id: 'steamId64', kind: 'field', label: 'Steam ID64 (manual entry)', value: steamId64 },

    header('stremioAccount', 'Stremio Account'),
    {
      id: 'stremioStatus',
      kind: 'info',
      label: loggedIn ? `✓ Logged in as ${stremioEmail}` : 'Not logged in to Stremio'
    },
    { id: 'stremioEmail', kind: 'field', label: 'Stremio Email', value: stremioEmail },
    { id: 'stremioPassword', kind: 'field', label: 'Stremio Password', value: stremioPassword, masked: true },
    {
      id: 'stremioLogin',
      kind: 'action',
      label: loggedIn ? 'Re-sync Addons From Stremio Account' : 'Log In & Sync Addons'
    },
    ...(loggedIn
      ? [
          {
            id: 'importHistory',
            kind: 'action' as const,
            label: 'Import Watch History & Library From Stremio'
          }
        ]
      : []),

    header('stremioAddons', 'Stremio Addons'),
    ...addons.map(
      (addon, i): SettingsRow => ({
        id: `addon-${i}`,
        kind: 'addon',
        label: addon.name,
        value: describeCapabilities(addon.resources)
      })
    ),
    { id: 'addAddon', kind: 'action', label: '+ Add Addon URL' }
  ]

  // Headers are visual dividers, not stops — menuIndex indexes into this
  // filtered list of the rows that can actually be focused.
  const selectableIndices = rows.reduce<number[]>((acc, row, i) => {
    if (row.kind !== 'header') acc.push(i)
    return acc
  }, [])
  const clampedMenuIndex = Math.min(menuIndex, Math.max(0, selectableIndices.length - 1))
  const activeIndex = selectableIndices[clampedMenuIndex] ?? 0

  useEffect(() => {
    if (zone !== 'menu') return
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
    setZone('menu')
    setEditingField(null)
  }

  function cancelKeyboard(): void {
    setZone('menu')
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
    }
  }

  useNavListener((action) => {
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

    // zone === 'menu'
    switch (action) {
      case 'up':
        setMenuIndex((i) => Math.max(0, i - 1))
        return
      case 'down':
        setMenuIndex((i) => Math.min(selectableIndices.length - 1, i + 1))
        return
      case 'confirm': {
        const row = rows[activeIndex]
        if (row) activateRow(row)
        return
      }
      case 'back':
      case 'menu':
        goHome()
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

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {rows.map((row, i) => {
          if (row.kind === 'header') {
            return (
              <h2
                key={row.id}
                className="mb-1 mt-4 px-1 text-xs font-bold uppercase tracking-wider text-muted first:mt-0"
              >
                {row.label}
              </h2>
            )
          }
          return (
            <div
              key={row.id}
              ref={(el) => (rowRefs.current[i] = el)}
              onClick={() => {
                setZone('menu')
                setMenuIndex(selectableIndices.indexOf(i))
                activateRow(row)
              }}
              className={`mb-2 flex items-center justify-between rounded-xl px-5 py-4 transition-colors ${
                row.kind === 'info' ? '' : 'cursor-pointer'
              } ${
                row.kind === 'info'
                  ? loggedIn && row.id === 'stremioStatus'
                    ? 'bg-accent/20 text-accent'
                    : 'bg-surface text-muted'
                  : zone === 'menu' && activeIndex === i
                    ? 'bg-surface-hi shadow-focus'
                    : 'bg-surface'
              }`}
            >
              <span className="flex items-center gap-3 font-medium">
                {row.kind === 'theme' && row.swatch && (
                  <span
                    className="h-4 w-4 shrink-0 rounded-full ring-1 ring-white/20"
                    style={{ backgroundColor: `rgb(${row.swatch})` }}
                  />
                )}
                {row.label}
                {row.kind === 'theme' && row.active && <span className="text-accent">✓</span>}
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

      <footer className="text-sm text-muted">{message}</footer>

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
