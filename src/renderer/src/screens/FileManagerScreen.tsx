import { useEffect, useRef, useState } from 'react'
import { useNavListener } from '../input/useNavListener'
import { useNavigationStore } from '../state/navigationStore'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { KEY_ROWS, applyKey, clampKeyboardFocus } from '../components/onScreenKeyboardLayout'
import type { FileEntry } from '@shared/filesystemTypes'

/** null = the root "This PC" view (Home shortcut + drives), not a real path. */
type CurrentPath = string | null
type Zone = 'list' | 'contextMenu' | 'confirmDelete' | 'keyboard'
type KeyboardPurpose = 'rename' | 'newFolder' | 'search'
type MenuActionId = 'open' | 'newFolder' | 'rename' | 'cut' | 'copy' | 'paste' | 'delete'
interface MenuOption {
  id: MenuActionId
  label: string
}
interface Clipboard {
  path: string
  name: string
  mode: 'copy' | 'cut'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`
}

function formatModified(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

function fileTypeLabel(entry: FileEntry): string {
  if (entry.isDirectory) return 'File folder'
  const dot = entry.name.lastIndexOf('.')
  if (dot <= 0 || dot === entry.name.length - 1) return 'File'
  return `${entry.name.slice(dot + 1).toUpperCase()} File`
}

export function FileManagerScreen(): JSX.Element {
  const goHome = useNavigationStore((s) => s.goHome)
  const [currentPath, setCurrentPath] = useState<CurrentPath>(null)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [focusIndex, setFocusIndex] = useState(0)
  const [message, setMessage] = useState('')
  const [zone, setZone] = useState<Zone>('list')
  const [menuIndex, setMenuIndex] = useState(0)
  const [confirmIndex, setConfirmIndex] = useState(0)
  const [clipboard, setClipboard] = useState<Clipboard | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [kbPurpose, setKbPurpose] = useState<KeyboardPurpose | null>(null)
  const [kbValue, setKbValue] = useState('')
  const [kbShift, setKbShift] = useState(false)
  const [kbRow, setKbRow] = useState(0)
  const [kbCol, setKbCol] = useState(0)
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])

  async function reload(preserveFocus = true): Promise<void> {
    if (currentPath === null) {
      const [home, drives] = await Promise.all([
        window.api.filesystem.getHomeDirectory(),
        window.api.filesystem.listDrives()
      ])
      setEntries([{ name: 'Home', path: home, isDirectory: true, size: 0, modifiedAt: 0 }, ...drives])
      if (!preserveFocus) setFocusIndex(0)
      setMessage('')
      return
    }
    const listing = await window.api.filesystem.listDirectory(currentPath)
    setEntries(listing.entries)
    if (!preserveFocus) setFocusIndex(0)
    else setFocusIndex((i) => Math.min(i, Math.max(0, listing.entries.length - 1)))
    setMessage(listing.error ?? '')
  }

  useEffect(() => {
    void reload(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath])

  useEffect(() => {
    rowRefs.current[focusIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusIndex])

  // entries stays the full unfiltered listing (so clearing the filter doesn't
  // need a re-fetch) — everything that indexes by focusIndex uses this
  // filtered view instead, so up/down and the context menu operate on
  // whatever's actually visible.
  const trimmedSearch = searchQuery.trim().toLowerCase()
  const visibleEntries = trimmedSearch
    ? entries.filter((e) => e.name.toLowerCase().includes(trimmedSearch))
    : entries

  function activateEntry(entry: FileEntry): void {
    if (entry.isDirectory) {
      setCurrentPath(entry.path)
      return
    }
    setMessage(`Opening ${entry.name}...`)
    void window.api.filesystem.openPath(entry.path).then((error) => {
      setMessage(error ? `Couldn't open ${entry.name}: ${error}` : `Opened ${entry.name}`)
    })
  }

  function goUp(): void {
    if (currentPath === null) {
      goHome()
      return
    }
    void window.api.filesystem.getParentPath(currentPath).then((parent) => {
      setCurrentPath(parent)
    })
  }

  function buildMenuOptions(): MenuOption[] {
    const options: MenuOption[] = []
    const entry = visibleEntries[focusIndex]
    if (entry) {
      options.push({ id: 'open', label: 'Open' })
      options.push({ id: 'rename', label: 'Rename' })
      options.push({ id: 'copy', label: 'Copy' })
      options.push({ id: 'cut', label: 'Cut' })
    }
    options.push({ id: 'newFolder', label: 'New Folder' })
    if (clipboard) options.push({ id: 'paste', label: `Paste "${clipboard.name}"` })
    if (entry) options.push({ id: 'delete', label: 'Delete' })
    return options
  }

  function closeMenu(): void {
    setZone('list')
    setMenuIndex(0)
  }

  function openKeyboardFor(purpose: KeyboardPurpose, initialValue: string): void {
    setKbPurpose(purpose)
    setKbValue(initialValue)
    setKbShift(false)
    setKbRow(0)
    setKbCol(0)
    setZone('keyboard')
  }

  async function runMenuAction(id: MenuActionId): Promise<void> {
    const entry = visibleEntries[focusIndex]
    if (currentPath === null) {
      closeMenu()
      return
    }
    switch (id) {
      case 'open':
        if (entry) activateEntry(entry)
        closeMenu()
        return
      case 'newFolder':
        openKeyboardFor('newFolder', '')
        return
      case 'rename':
        if (entry) openKeyboardFor('rename', entry.name)
        return
      case 'copy':
        if (entry) {
          setClipboard({ path: entry.path, name: entry.name, mode: 'copy' })
          setMessage(`Copied ${entry.name}`)
        }
        closeMenu()
        return
      case 'cut':
        if (entry) {
          setClipboard({ path: entry.path, name: entry.name, mode: 'cut' })
          setMessage(`Cut ${entry.name}`)
        }
        closeMenu()
        return
      case 'paste': {
        if (!clipboard) {
          closeMenu()
          return
        }
        closeMenu()
        setMessage(`Pasting ${clipboard.name}...`)
        const error =
          clipboard.mode === 'copy'
            ? await window.api.filesystem.copy(clipboard.path, currentPath)
            : await window.api.filesystem.move(clipboard.path, currentPath)
        setMessage(error ? `Paste failed: ${error}` : `Pasted ${clipboard.name}`)
        if (!error && clipboard.mode === 'cut') setClipboard(null)
        void reload()
        return
      }
      case 'delete':
        setConfirmIndex(0)
        setZone('confirmDelete')
        return
      default:
        return
    }
  }

  async function confirmDelete(): Promise<void> {
    const entry = visibleEntries[focusIndex]
    setZone('list')
    if (!entry) return
    setMessage(`Deleting ${entry.name}...`)
    const error = await window.api.filesystem.delete(entry.path)
    setMessage(error ? `Delete failed: ${error}` : `Deleted ${entry.name} (moved to Recycle Bin)`)
    void reload()
  }

  async function submitKeyboard(finalValue: string): Promise<void> {
    const value = finalValue.trim()
    const purpose = kbPurpose
    setZone('list')
    setKbPurpose(null)

    if (purpose === 'search') {
      setSearchQuery(finalValue)
      setFocusIndex(0)
      return
    }
    if (!value || !currentPath) return

    if (purpose === 'newFolder') {
      setMessage(`Creating "${value}"...`)
      const error = await window.api.filesystem.createFolder(currentPath, value)
      setMessage(error ? `Couldn't create folder: ${error}` : `Created "${value}"`)
      void reload()
      return
    }
    if (purpose === 'rename') {
      const entry = visibleEntries[focusIndex]
      if (!entry) return
      setMessage(`Renaming to "${value}"...`)
      const error = await window.api.filesystem.rename(entry.path, value)
      setMessage(error ? `Rename failed: ${error}` : `Renamed to "${value}"`)
      void reload()
    }
  }

  function cancelKeyboard(): void {
    setZone('list')
    setKbPurpose(null)
  }

  function pressVirtualKey(key: string): void {
    const result = applyKey(key, kbValue, kbShift)
    setKbValue(result.value)
    setKbShift(result.shift)
    if (result.done) void submitKeyboard(result.value)
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
          void submitKeyboard(kbValue)
          return
        case 'back':
        case 'menu':
          cancelKeyboard()
          return
        default:
          return
      }
    }

    if (zone === 'confirmDelete') {
      switch (action) {
        case 'left':
        case 'right':
          setConfirmIndex((i) => (i === 0 ? 1 : 0))
          return
        case 'confirm':
          if (confirmIndex === 0) void confirmDelete()
          else setZone('list')
          return
        case 'back':
        case 'menu':
          setZone('list')
          return
        default:
          return
      }
    }

    if (zone === 'contextMenu') {
      const options = buildMenuOptions()
      switch (action) {
        case 'up':
          setMenuIndex((i) => Math.max(0, i - 1))
          return
        case 'down':
          setMenuIndex((i) => Math.min(options.length - 1, i + 1))
          return
        case 'confirm': {
          const option = options[menuIndex]
          if (option) void runMenuAction(option.id)
          return
        }
        case 'back':
        case 'menu':
        case 'contextMenu':
          closeMenu()
          return
        default:
          return
      }
    }

    // zone === 'list'
    switch (action) {
      case 'up':
        setFocusIndex((i) => Math.max(0, i - 1))
        return
      case 'down':
        setFocusIndex((i) => Math.min(visibleEntries.length - 1, i + 1))
        return
      case 'confirm': {
        const entry = visibleEntries[focusIndex]
        if (entry) activateEntry(entry)
        return
      }
      case 'search':
        openKeyboardFor('search', searchQuery)
        return
      case 'contextMenu':
        if (currentPath === null) return
        setMenuIndex(0)
        setZone('contextMenu')
        return
      case 'back':
      case 'menu':
        if (searchQuery) {
          setSearchQuery('')
          setFocusIndex(0)
          return
        }
        goUp()
        return
      default:
        return
    }
  }, 'files')

  const isRoot = currentPath === null
  const menuOptions = zone === 'contextMenu' ? buildMenuOptions() : []

  return (
    <div className="flex h-screen flex-col gap-4 bg-bg px-10 py-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-3xl font-bold tracking-tight">{currentPath ?? 'This PC'}</h1>
          {searchQuery && (
            <span className="shrink-0 rounded-full bg-surface-hi px-3 py-1 text-sm text-accent">
              Filtering: "{searchQuery}" (Back to clear)
            </span>
          )}
        </div>
        {!isRoot && (
          <span className="shrink-0 text-sm text-muted">
            Search: Triangle · Options: click left stick (L3)
          </span>
        )}
      </header>

      {!isRoot && visibleEntries.length > 0 && (
        <div className="flex items-center gap-4 px-5 text-xs uppercase tracking-wide text-muted">
          <span className="flex-1">Name</span>
          <span className="w-40 shrink-0">Date modified</span>
          <span className="w-28 shrink-0">Type</span>
          <span className="w-24 shrink-0 text-right">Size</span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {visibleEntries.length === 0 && (
          <span className="px-5 text-muted">{searchQuery ? 'No matches' : 'Empty folder'}</span>
        )}
        {visibleEntries.map((entry, i) => (
          <div
            key={entry.path}
            ref={(el) => (rowRefs.current[i] = el)}
            onClick={() => {
              setFocusIndex(i)
              activateEntry(entry)
            }}
            className={`flex cursor-pointer items-center gap-4 rounded-xl px-5 py-3 transition-colors ${
              focusIndex === i && zone === 'list' ? 'bg-surface-hi shadow-focus' : 'bg-surface'
            } ${clipboard?.path === entry.path && clipboard.mode === 'cut' ? 'opacity-50' : ''}`}
          >
            <span className="text-xl">{entry.isDirectory ? '📁' : '📄'}</span>
            <span className="flex-1 truncate font-medium">{entry.name}</span>
            {!isRoot && (
              <>
                <span className="w-40 shrink-0 text-sm text-muted">{formatModified(entry.modifiedAt)}</span>
                <span className="w-28 shrink-0 truncate text-sm text-muted">{fileTypeLabel(entry)}</span>
                <span className="w-24 shrink-0 text-right text-sm text-muted">
                  {entry.isDirectory ? '' : formatSize(entry.size)}
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      <footer className="text-sm text-muted">{message}</footer>

      {zone === 'contextMenu' && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="flex w-80 flex-col gap-2 rounded-2xl bg-surface p-6">
            <h2 className="mb-2 truncate text-lg font-semibold">{visibleEntries[focusIndex]?.name ?? 'Folder'}</h2>
            {menuOptions.map((option, i) => (
              <div
                key={option.id}
                onClick={() => void runMenuAction(option.id)}
                className={`cursor-pointer rounded-xl px-5 py-3 font-medium transition-colors ${
                  menuIndex === i ? 'bg-accent text-white' : 'bg-surface-hi text-muted'
                }`}
              >
                {option.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {zone === 'confirmDelete' && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="flex w-80 flex-col gap-4 rounded-2xl bg-surface p-8">
            <h2 className="text-lg font-semibold">
              Move "{visibleEntries[focusIndex]?.name}" to the Recycle Bin?
            </h2>
            <div className="flex gap-3">
              {['Yes', 'No'].map((label, i) => (
                <div
                  key={label}
                  onClick={() => {
                    setConfirmIndex(i)
                    if (i === 0) void confirmDelete()
                    else setZone('list')
                  }}
                  className={`flex-1 cursor-pointer rounded-xl px-5 py-3 text-center font-medium transition-colors ${
                    confirmIndex === i ? 'bg-accent text-white' : 'bg-surface-hi text-muted'
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
          label={kbPurpose === 'rename' ? 'Rename' : kbPurpose === 'search' ? 'Search this folder' : 'New folder name'}
          value={kbValue}
          shift={kbShift}
          focusedRow={kbRow}
          focusedCol={kbCol}
          onChange={setKbValue}
          onSubmit={() => void submitKeyboard(kbValue)}
          onCancel={cancelKeyboard}
          onKeyPress={pressVirtualKey}
        />
      )}
    </div>
  )
}
