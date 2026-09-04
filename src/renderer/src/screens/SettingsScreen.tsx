import { useEffect, useRef, useState } from 'react'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { KEY_ROWS, applyKey, clampKeyboardFocus } from '../components/onScreenKeyboardLayout'
import { useNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'
import { useNavigationStore } from '../state/navigationStore'
import { useThemeStore } from '../state/themeStore'
import type { AddonSummary } from '@shared/stremioTypes'

type RowKind = 'field' | 'action' | 'addon' | 'info' | 'theme'

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

export function SettingsScreen(): JSX.Element {
  const [steamApiKey, setSteamApiKey] = useState('')
  const [steamId64, setSteamId64] = useState('')
  const [stremioEmail, setStremioEmail] = useState('')
  const [stremioPassword, setStremioPassword] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [addons, setAddons] = useState<AddonSummary[]>([])

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
    window.api.settings.getSteam().then((s) => {
      setSteamApiKey(s.apiKey)
      setSteamId64(s.steamId64)
    })
    window.api.settings.getStremio().then((s) => {
      setAddons(s.addons)
      setLoggedIn(Boolean(s.authKey))
      setStremioEmail(s.email ?? '')
    })
  }, [])

  const rows: SettingsRow[] = [
    ...allThemes.map(
      (theme): SettingsRow => ({
        id: `theme-${theme.id}`,
        kind: 'theme',
        label: theme.name,
        swatch: theme.vars['--color-accent'],
        active: theme.id === themeId
      })
    ),
    { id: 'steamApiKey', kind: 'field', label: 'Steam API Key', value: steamApiKey, masked: true },
    { id: 'steamId64', kind: 'field', label: 'Steam ID64', value: steamId64 },
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

  const activeIndex = Math.min(menuIndex, rows.length - 1)

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
    if (field === 'steamApiKey') {
      setSteamApiKey(value)
      window.api.settings.setSteam({ apiKey: value, steamId64 })
      setMessage('Steam API key saved')
    } else if (field === 'steamId64') {
      setSteamId64(value)
      window.api.settings.setSteam({ apiKey: steamApiKey, steamId64: value })
      setMessage('Steam ID64 saved')
    } else if (field === 'stremioEmail') {
      setStremioEmail(value)
    } else if (field === 'stremioPassword') {
      setStremioPassword(value)
    } else if (field === 'newAddon' && value.trim()) {
      setMessage('Adding addon...')
      window.api.settings.addStremioAddon(value.trim()).then((next) => {
        setAddons(next)
        setMessage(`Added "${next[next.length - 1]?.name}"`)
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

  function activateRow(row: SettingsRow): void {
    if (row.kind === 'info') {
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
    } else if (row.id === 'stremioLogin') {
      void doLogin()
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
        setMenuIndex((i) => Math.min(rows.length - 1, i + 1))
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
  })

  return (
    <div className="flex h-screen flex-col gap-6 bg-bg px-10 py-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {rows.map((row, i) => (
          <div
            key={row.id}
            ref={(el) => (rowRefs.current[i] = el)}
            onClick={() => {
              setZone('menu')
              setMenuIndex(i)
              activateRow(row)
            }}
            className={`flex items-center justify-between rounded-xl px-5 py-4 transition-colors ${
              row.kind === 'info' ? '' : 'cursor-pointer'
            } ${
              row.kind === 'info'
                ? loggedIn
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
        ))}
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
