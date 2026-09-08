import { useEffect, useRef, useState } from 'react'
import { Check, Puzzle, Search, ShieldAlert } from 'lucide-react'
import { FocusableCard, type CardItem } from '../components/FocusableCard'
import { BackButton } from '../components/NavButtons'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { KEY_ROWS, applyKey, clampKeyboardFocus } from '../components/onScreenKeyboardLayout'
import { useExclusiveNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'
import type { CommunityPluginSummary, PluginPermission } from '@shared/pluginTypes'

const STORE_COLUMNS = 4

const CATEGORY_LABELS: Record<string, string> = {
  game: 'Game',
  media: 'Media',
  widget: 'Widget',
  system: 'System',
  input: 'Input',
  social: 'Social',
  other: 'Other'
}

const PERMISSION_LABELS: Record<PluginPermission, string> = {
  network: 'Access the internet',
  filesystem: 'Read/write files beyond its own storage',
  notifications: 'Show notifications',
  'home-widget': 'Add a tile/card to Home',
  'settings-panel': 'Add its own panel under Settings > Plugins',
  background: 'Keep running while not the active screen'
}

function priceLabel(price: CommunityPluginSummary['manifest']['price']): string {
  return price.kind === 'free' ? 'Free' : `$${price.amountUsd.toFixed(2)}`
}

type Zone = 'grid' | 'detail' | 'keyboard'

/**
 * Settings > Plugins > Browse Plugin Store — browses the community plugins
 * repo (open to third-party submissions, see pluginTypes.ts) and shows what
 * each one would need permission to do before Install is ever pressed —
 * that review IS the consent step; there's no second confirmation dialog
 * behind it. Install itself is real: main/plugins/install.ts re-fetches
 * and re-validates the manifest fresh (never trusting this panel's own
 * cached summary), downloads the bundle, and hashes it so a later launch
 * can detect if it's ever changed on disk. Actually running an installed
 * plugin happens elsewhere (see PluginHost.tsx, opened from Settings >
 * Plugins) — this panel's own job stays discovery + install. Full-screen
 * overlay with its own exclusive nav, same pattern as TvAddonsPanel.
 */
export function PluginStorePanel({ onClose }: { onClose: () => void }): JSX.Element {
  const message = useStatusStore((s) => s.message)
  const setMessage = useStatusStore((s) => s.setMessage)

  const [plugins, setPlugins] = useState<CommunityPluginSummary[]>([])
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [zone, setZone] = useState<Zone>('grid')
  const [query, setQuery] = useState('')
  const [gridIndex, setGridIndex] = useState(0)

  const [kbValue, setKbValue] = useState('')
  const [kbShift, setKbShift] = useState(false)
  const [kbRow, setKbRow] = useState(0)
  const [kbCol, setKbCol] = useState(0)

  const gridRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    window.api.plugins
      .listCommunity()
      .then(setPlugins)
      .catch(() => setPlugins([]))
      .finally(() => setLoading(false))
    window.api.plugins
      .listInstalled()
      .then((installed) => setInstalledIds(new Set(installed.map((p) => p.manifest.id))))
      .catch(() => {})
  }, [])

  const filtered = (() => {
    const q = query.trim().toLowerCase()
    if (!q) return plugins
    return plugins.filter(
      (p) =>
        p.manifest.name.toLowerCase().includes(q) ||
        p.manifest.description.toLowerCase().includes(q) ||
        p.manifest.author.toLowerCase().includes(q)
    )
  })()
  const clampedGridIndex = Math.min(gridIndex, Math.max(0, filtered.length - 1))
  const selected = filtered[clampedGridIndex] ?? null

  useEffect(() => {
    if (zone !== 'grid') return
    gridRefs.current[clampedGridIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, clampedGridIndex])

  function openKeyboard(): void {
    setKbValue(query)
    setKbShift(false)
    setKbRow(0)
    setKbCol(0)
    setZone('keyboard')
  }

  function submitKeyboard(finalValue: string): void {
    setQuery(finalValue.trim())
    setGridIndex(0)
    setZone('grid')
  }

  function cancelKeyboard(): void {
    setZone('grid')
  }

  function pressVirtualKey(key: string): void {
    const result = applyKey(key, kbValue, kbShift)
    setKbValue(result.value)
    setKbShift(result.shift)
    if (result.done) submitKeyboard(result.value)
  }

  async function doInstall(plugin: CommunityPluginSummary): Promise<void> {
    setInstallingId(plugin.manifest.id)
    setMessage(`Installing ${plugin.manifest.name}...`)
    try {
      const result = await window.api.plugins.install(plugin.folder)
      if (result.success && result.plugin) {
        setInstalledIds((prev) => new Set(prev).add(result.plugin!.manifest.id))
        setMessage(`Installed "${result.plugin.manifest.name}" — open it from Settings > Plugins`)
      } else {
        setMessage(`Couldn't install ${plugin.manifest.name}: ${result.error}`)
      }
    } catch (error) {
      setMessage(`Couldn't install ${plugin.manifest.name}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setInstallingId(null)
    }
  }

  useExclusiveNavListener((action) => {
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

    if (zone === 'detail') {
      switch (action) {
        case 'confirm':
          if (selected) void doInstall(selected)
          return
        case 'back':
        case 'menu':
          setZone('grid')
          return
        default:
          return
      }
    }

    // zone === 'grid'
    const cols = STORE_COLUMNS
    switch (action) {
      case 'search':
        openKeyboard()
        return
      case 'up':
        setGridIndex((i) => Math.max(0, i - cols))
        return
      case 'down':
        setGridIndex((i) => (i + cols < filtered.length ? i + cols : i))
        return
      case 'left':
        setGridIndex((i) => (i % cols === 0 ? i : i - 1))
        return
      case 'right':
        setGridIndex((i) => (i % cols === cols - 1 || i === filtered.length - 1 ? i : i + 1))
        return
      case 'confirm':
        if (selected) setZone('detail')
        return
      case 'back':
      case 'menu':
        onClose()
        return
      default:
        return
    }
  }, true)

  return (
    <div className="fixed inset-0 z-30 flex h-screen flex-col gap-6 overflow-hidden bg-bg px-10 py-8">
      {zone === 'detail' && selected ? (
        <>
          <header className="flex items-center gap-4">
            <BackButton label="Plugin Store" onClick={() => setZone('grid')} />
            <h1 className="text-3xl font-bold tracking-tight">{selected.manifest.name}</h1>
          </header>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-1">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-card bg-surface-hi">
                {selected.iconUrl ? (
                  <img src={selected.iconUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Puzzle className="h-8 w-8 text-muted" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted">
                  by {selected.manifest.author} · v{selected.manifest.version} ·{' '}
                  {CATEGORY_LABELS[selected.manifest.category] ?? selected.manifest.category}
                </span>
                <span className="text-lg font-semibold text-accent">{priceLabel(selected.manifest.price)}</span>
              </div>
            </div>

            <p className="max-w-2xl text-sm text-muted">{selected.manifest.description}</p>

            <div className="flex flex-col gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
                <ShieldAlert className="h-4 w-4" /> This plugin would be able to
              </h2>
              {selected.manifest.permissions.length === 0 ? (
                <p className="text-sm text-muted">Nothing beyond its own on-screen panel.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {selected.manifest.permissions.map((permission) => (
                    <li key={permission} className="flex items-center gap-2 rounded-xl bg-surface px-4 py-2.5 text-sm">
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-accent" />
                      {PERMISSION_LABELS[permission] ?? permission}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div
              onClick={() => void doInstall(selected)}
              className="mt-2 flex w-64 cursor-pointer items-center justify-center gap-2 rounded-control bg-accent-gradient px-6 py-3 font-semibold text-white shadow-focus"
            >
              <Check className="h-4 w-4" />
              {installingId === selected.manifest.id
                ? 'Installing...'
                : installedIds.has(selected.manifest.id)
                  ? 'Reinstall'
                  : 'Install'}
            </div>
            {installedIds.has(selected.manifest.id) && installingId !== selected.manifest.id && (
              <p className="text-xs text-muted">
                Already installed — open it from Settings &gt; Plugins, or reinstall to pull the latest version.
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <header className="flex items-center gap-4">
            <BackButton label="Plugins" onClick={onClose} />
            <h1 className="text-3xl font-bold tracking-tight">Plugin Store</h1>
            <div
              onClick={openKeyboard}
              className="ml-auto flex w-72 cursor-pointer items-center gap-2 rounded-full bg-surface-hi px-4 py-2 text-sm text-muted transition-colors hover:text-white"
            >
              <Search className="h-4 w-4 shrink-0" />
              {query ? `"${query}"` : 'Search plugins...'}
            </div>
          </header>
          <p className="-mt-4 text-sm text-muted">
            {plugins.length > 0
              ? `${filtered.length} of ${plugins.length} plugin(s) from the community repo`
              : "Anyone can submit a plugin here — review what it'd be able to do before installing anything."}
          </p>

          {loading ? (
            <p className="text-muted">Loading plugin collection...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted">{query ? `No plugins match "${query}"` : 'No plugins found.'}</p>
          ) : (
            <div className="grid flex-1 auto-rows-min grid-cols-4 gap-[max(2rem,var(--tile-grow-pad))] overflow-y-auto p-[var(--tile-grow-pad)]">
              {filtered.map((plugin, i) => {
                const item: CardItem = {
                  id: plugin.manifest.id,
                  title: plugin.manifest.name,
                  subtitle: installedIds.has(plugin.manifest.id)
                    ? `Installed · ${plugin.manifest.author}`
                    : `${plugin.manifest.author} · ${priceLabel(plugin.manifest.price)}`,
                  imageUrl: plugin.iconUrl ?? undefined,
                  icon: Puzzle,
                  gradientDirection: 'bg-gradient-to-br'
                }
                return (
                  <div
                    key={plugin.manifest.id}
                    ref={(el) => (gridRefs.current[i] = el)}
                    className="scroll-m-[var(--tile-grow-pad)]"
                  >
                    <FocusableCard
                      item={item}
                      focused={clampedGridIndex === i}
                      onClick={() => {
                        setGridIndex(i)
                        setZone('detail')
                      }}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <footer className="text-sm text-muted">{message}</footer>

      {zone === 'keyboard' && (
        <OnScreenKeyboard
          label="Search Plugins"
          value={kbValue}
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
