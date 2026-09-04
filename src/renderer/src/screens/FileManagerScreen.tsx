import { useEffect, useRef, useState } from 'react'
import { useNavListener } from '../input/useNavListener'
import { useNavigationStore } from '../state/navigationStore'
import type { FileEntry } from '@shared/filesystemTypes'

/** null = the root "This PC" view (Home shortcut + drives), not a real path. */
type CurrentPath = string | null

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

export function FileManagerScreen(): JSX.Element {
  const goHome = useNavigationStore((s) => s.goHome)
  const [currentPath, setCurrentPath] = useState<CurrentPath>(null)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [focusIndex, setFocusIndex] = useState(0)
  const [message, setMessage] = useState('')
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      if (currentPath === null) {
        const [home, drives] = await Promise.all([
          window.api.filesystem.getHomeDirectory(),
          window.api.filesystem.listDrives()
        ])
        if (cancelled) return
        setEntries([{ name: 'Home', path: home, isDirectory: true, size: 0, modifiedAt: 0 }, ...drives])
        setFocusIndex(0)
        setMessage('')
        return
      }
      const listing = await window.api.filesystem.listDirectory(currentPath)
      if (cancelled) return
      setEntries(listing.entries)
      setFocusIndex(0)
      setMessage(listing.error ?? '')
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [currentPath])

  useEffect(() => {
    rowRefs.current[focusIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusIndex])

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

  useNavListener((action) => {
    switch (action) {
      case 'up':
        setFocusIndex((i) => Math.max(0, i - 1))
        return
      case 'down':
        setFocusIndex((i) => Math.min(entries.length - 1, i + 1))
        return
      case 'confirm': {
        const entry = entries[focusIndex]
        if (entry) activateEntry(entry)
        return
      }
      case 'back':
      case 'menu':
        goUp()
        return
      default:
        return
    }
  }, 'files')

  return (
    <div className="flex h-screen flex-col gap-6 bg-bg px-10 py-8">
      <header className="flex items-center gap-4">
        <h1 className="truncate text-3xl font-bold tracking-tight">{currentPath ?? 'This PC'}</h1>
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {entries.length === 0 && <span className="text-muted">Empty folder</span>}
        {entries.map((entry, i) => (
          <div
            key={entry.path}
            ref={(el) => (rowRefs.current[i] = el)}
            onClick={() => {
              setFocusIndex(i)
              activateEntry(entry)
            }}
            className={`flex cursor-pointer items-center gap-4 rounded-xl px-5 py-3 transition-colors ${
              focusIndex === i ? 'bg-surface-hi shadow-focus' : 'bg-surface'
            }`}
          >
            <span className="text-xl">{entry.isDirectory ? '📁' : '📄'}</span>
            <span className="flex-1 truncate font-medium">{entry.name}</span>
            {!entry.isDirectory && <span className="text-sm text-muted">{formatSize(entry.size)}</span>}
          </div>
        ))}
      </div>

      <footer className="text-sm text-muted">{message}</footer>
    </div>
  )
}
