import { useEffect, useRef, useState } from 'react'
import { Download, Plus, Search, Store, Trash2 } from 'lucide-react'
import { FocusableCard, type CardItem } from '../components/FocusableCard'
import { BackButton } from '../components/NavButtons'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { KEY_ROWS, applyKey, clampKeyboardFocus } from '../components/onScreenKeyboardLayout'
import { useExclusiveNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'
import type { AddonSummary, CommunityAddon } from '@shared/stremioTypes'

// The one addon with a fixed, public, no-config manifest URL worth offering as
// a one-tap default — everything else (Debridio included) is personalized per
// account, so there's no fixed URL to guess; those go through "Add Addon URL"
// with the user pasting their own generated link.
const TORRENTIO_URL = 'https://torrentio.strem.fun/manifest.json'
const ADDON_STORE_COLUMNS = 4

const ADDON_CAPABILITY_LABELS: Record<string, string> = {
  stream: 'Stream',
  catalog: 'Catalog',
  meta: 'Meta',
  subtitles: 'Subtitles',
  addon_catalog: 'Addon Catalog'
}

function describeAddonCapabilities(resources: string[]): string {
  return resources.map((r) => ADDON_CAPABILITY_LABELS[r] ?? r).join(', ')
}

type AddonPanelRow =
  | { kind: 'addon'; addon: AddonSummary }
  | { kind: 'browseStore' }
  | { kind: 'quickAddTorrentio' }
  | { kind: 'addCustom' }

type View = 'list' | 'store'
type Zone = 'list' | 'store' | 'keyboard'

/**
 * TV's stream/catalog/subtitle addon management, moved here from being a tab
 * inside the TV section itself — a first, standalone plugin-management
 * panel meant to set the pattern for whatever else Settings > Plugins
 * grows into, rather than
 * folding straight into SettingsScreen.tsx's own single monolithic row list.
 * Full-screen overlay with its own exclusive nav (see useExclusiveNavListener)
 * so it doesn't have to integrate with SettingsScreen's own zone state at
 * all — rendered conditionally from there, torn down via onClose.
 */
export function TvAddonsPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const message = useStatusStore((s) => s.message)
  const setMessage = useStatusStore((s) => s.setMessage)

  const [configuredAddons, setConfiguredAddons] = useState<AddonSummary[]>([])
  const [view, setView] = useState<View>('list')
  const [zone, setZone] = useState<Zone>('list')
  const [addonFocusIndex, setAddonFocusIndex] = useState(0)
  const [communityAddons, setCommunityAddons] = useState<CommunityAddon[]>([])
  const [communityAddonsLoading, setCommunityAddonsLoading] = useState(false)
  const [addonStoreQuery, setAddonStoreQuery] = useState('')
  const [addonStoreIndex, setAddonStoreIndex] = useState(0)

  const [kbValue, setKbValue] = useState('')
  const [kbShift, setKbShift] = useState(false)
  const [kbRow, setKbRow] = useState(0)
  const [kbCol, setKbCol] = useState(0)
  const [kbPurpose, setKbPurpose] = useState<'addonUrl' | 'addonStoreSearch'>('addonUrl')

  const addonRowRefs = useRef<Array<HTMLDivElement | null>>([])
  const addonStoreRefs = useRef<Array<HTMLDivElement | null>>([])

  const addonPanelRows: AddonPanelRow[] = [
    { kind: 'browseStore' },
    ...configuredAddons.map((addon): AddonPanelRow => ({ kind: 'addon', addon })),
    { kind: 'quickAddTorrentio' },
    { kind: 'addCustom' }
  ]
  const clampedAddonFocusIndex = Math.min(addonFocusIndex, Math.max(0, addonPanelRows.length - 1))

  const filteredCommunityAddons = (() => {
    const q = addonStoreQuery.trim().toLowerCase()
    if (!q) return communityAddons
    return communityAddons.filter((a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
  })()
  const clampedAddonStoreIndex = Math.min(addonStoreIndex, Math.max(0, filteredCommunityAddons.length - 1))

  useEffect(() => {
    window.api.settings.getStremio().then((s) => setConfiguredAddons(s.addons)).catch(() => {})
  }, [])

  useEffect(() => {
    if (zone !== 'list') return
    addonRowRefs.current[clampedAddonFocusIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, clampedAddonFocusIndex])

  useEffect(() => {
    if (zone !== 'store') return
    addonStoreRefs.current[clampedAddonStoreIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, clampedAddonStoreIndex])

  async function submitAddonUrl(url: string): Promise<void> {
    setView('list')
    setZone('list')
    const trimmed = url.trim()
    if (!trimmed) return
    setMessage('Adding addon...')
    try {
      const next = await window.api.settings.addStremioAddon(trimmed)
      setConfiguredAddons(next)
      setMessage(`Added "${next[next.length - 1]?.name}"`)
    } catch (error) {
      setMessage(`Couldn't add addon: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Lazy-loaded (only once, on first visit) rather than fetched whenever this
  // panel mounts — most sessions never open the store at all, and the main
  // process caches the ~300KB collection for an hour regardless.
  function openAddonStore(): void {
    setView('store')
    setZone('store')
    setAddonStoreIndex(0)
    if (communityAddons.length > 0 || communityAddonsLoading) return
    setCommunityAddonsLoading(true)
    window.api.settings
      .listCommunityAddons()
      .then(setCommunityAddons)
      .catch(() => setCommunityAddons([]))
      .finally(() => setCommunityAddonsLoading(false))
  }

  async function installCommunityAddon(addon: CommunityAddon): Promise<void> {
    if (configuredAddons.some((a) => a.url === addon.transportUrl)) {
      setMessage(`${addon.name} is already added`)
      return
    }
    setMessage(`Installing ${addon.name}...`)
    try {
      const next = await window.api.settings.addStremioAddon(addon.transportUrl)
      setConfiguredAddons(next)
      setMessage(`Installed "${addon.name}"`)
    } catch (error) {
      setMessage(`Couldn't install ${addon.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function quickAddTorrentio(): Promise<void> {
    if (configuredAddons.some((a) => a.url === TORRENTIO_URL)) {
      setMessage('Torrentio is already added')
      return
    }
    setMessage('Adding Torrentio...')
    try {
      const next = await window.api.settings.addStremioAddon(TORRENTIO_URL)
      setConfiguredAddons(next)
      setMessage(`Added "${next[next.length - 1]?.name}"`)
    } catch (error) {
      setMessage(`Couldn't add Torrentio: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function removeAddon(addon: AddonSummary): Promise<void> {
    const next = configuredAddons.filter((a) => a.url !== addon.url)
    setConfiguredAddons(next)
    await window.api.settings.setStremioAddons(next)
    setMessage(`Removed "${addon.name}"`)
  }

  function openKeyboard(initialValue: string, purpose: 'addonUrl' | 'addonStoreSearch'): void {
    setKbPurpose(purpose)
    setKbValue(initialValue)
    setKbShift(false)
    setKbRow(0)
    setKbCol(0)
    setZone('keyboard')
  }

  function submitKeyboard(finalValue: string): void {
    if (kbPurpose === 'addonUrl') void submitAddonUrl(finalValue)
    else {
      setAddonStoreQuery(finalValue.trim())
      setAddonStoreIndex(0)
      setView('store')
      setZone('store')
    }
  }

  function cancelKeyboard(): void {
    if (kbPurpose === 'addonUrl') {
      setView('list')
      setZone('list')
    } else {
      setView('store')
      setZone('store')
    }
  }

  function pressVirtualKey(key: string): void {
    const result = applyKey(key, kbValue, kbShift)
    setKbValue(result.value)
    setKbShift(result.shift)
    if (result.done) submitKeyboard(result.value)
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

    if (zone === 'store') {
      const cols = ADDON_STORE_COLUMNS
      switch (action) {
        case 'search':
          openKeyboard(addonStoreQuery, 'addonStoreSearch')
          return
        case 'up':
          setAddonStoreIndex((i) => Math.max(0, i - cols))
          return
        case 'down':
          setAddonStoreIndex((i) => (i + cols < filteredCommunityAddons.length ? i + cols : i))
          return
        case 'left':
          setAddonStoreIndex((i) => (i % cols === 0 ? i : i - 1))
          return
        case 'right':
          setAddonStoreIndex((i) =>
            i % cols === cols - 1 || i === filteredCommunityAddons.length - 1 ? i : i + 1
          )
          return
        case 'confirm': {
          const addon = filteredCommunityAddons[clampedAddonStoreIndex]
          if (addon) void installCommunityAddon(addon)
          return
        }
        case 'back':
        case 'menu':
          setView('list')
          setZone('list')
          setAddonStoreQuery('')
          return
        default:
          return
      }
    }

    // zone === 'list'
    switch (action) {
      case 'up':
        setAddonFocusIndex((i) => Math.max(0, i - 1))
        return
      case 'down':
        setAddonFocusIndex((i) => Math.min(addonPanelRows.length - 1, i + 1))
        return
      case 'confirm': {
        const row = addonPanelRows[clampedAddonFocusIndex]
        if (!row) return
        if (row.kind === 'addon') void removeAddon(row.addon)
        else if (row.kind === 'browseStore') openAddonStore()
        else if (row.kind === 'quickAddTorrentio') void quickAddTorrentio()
        else openKeyboard('', 'addonUrl')
        return
      }
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
      {view === 'store' ? (
        <>
          <header className="flex items-center gap-4">
            <BackButton
              label="TV Addons"
              onClick={() => {
                setView('list')
                setZone('list')
                setAddonStoreQuery('')
              }}
            />
            <h1 className="text-3xl font-bold tracking-tight">Addon Store</h1>
            <div
              onClick={() => openKeyboard(addonStoreQuery, 'addonStoreSearch')}
              className="ml-auto flex w-72 cursor-pointer items-center gap-2 rounded-full bg-surface-hi px-4 py-2 text-sm text-muted transition-colors hover:text-white"
            >
              <Search className="h-4 w-4 shrink-0" />
              {addonStoreQuery ? `"${addonStoreQuery}"` : 'Search addons...'}
            </div>
          </header>
          <p className="-mt-4 text-sm text-muted">
            {communityAddons.length > 0
              ? `${filteredCommunityAddons.length} of ${communityAddons.length} addons from Stremio's public collection`
              : "Stremio's public addon collection, the same one its own Community Addons board uses."}
          </p>

          {communityAddonsLoading ? (
            <p className="text-muted">Loading addon collection...</p>
          ) : filteredCommunityAddons.length === 0 ? (
            <p className="text-muted">{addonStoreQuery ? `No addons match "${addonStoreQuery}"` : 'No addons found.'}</p>
          ) : (
            <div className="grid flex-1 auto-rows-min grid-cols-4 gap-[max(2rem,var(--tile-grow-pad))] overflow-y-auto p-[var(--tile-grow-pad)]">
              {filteredCommunityAddons.map((addon, i) => {
                const isInstalled = configuredAddons.some((a) => a.url === addon.transportUrl)
                return (
                  // Keyed on transportUrl, not manifest.id — a couple of real
                  // entries in Stremio's own collection share the same
                  // declared id across genuinely different addons/instances.
                  <div
                    key={addon.transportUrl}
                    ref={(el) => (addonStoreRefs.current[i] = el)}
                    className="scroll-m-[var(--tile-grow-pad)]"
                  >
                    <FocusableCard
                      item={
                        {
                          id: addon.transportUrl,
                          title: addon.name,
                          subtitle: isInstalled ? `Installed · ${describeAddonCapabilities(addon.resources)}` : addon.description,
                          imageUrl: addon.logo ?? undefined,
                          icon: Store,
                          gradientDirection: 'bg-gradient-to-br'
                        } satisfies CardItem
                      }
                      focused={addonStoreIndex === i}
                      onClick={() => {
                        setAddonStoreIndex(i)
                        void installCommunityAddon(addon)
                      }}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <header className="flex items-center gap-4">
            <BackButton label="Plugins" onClick={onClose} />
            <h1 className="text-3xl font-bold tracking-tight">TV Addons</h1>
          </header>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-5">
            <p className="px-1 text-sm text-muted">
              These are queried directly over the open Stremio addon protocol, no Stremio app or account needed.
              Debridio and similar debrid-backed addons generate a personalized URL on their own site; paste that in
              below.
            </p>
            {addonPanelRows.map((row, i) => {
              const focused = zone === 'list' && clampedAddonFocusIndex === i
              if (row.kind === 'browseStore') {
                return (
                  <div
                    key="browseStore"
                    ref={(el) => (addonRowRefs.current[i] = el)}
                    onClick={() => {
                      setAddonFocusIndex(i)
                      openAddonStore()
                    }}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-5 py-4 ring-1 transition-colors ${
                      focused ? 'bg-surface-hi shadow-focus ring-2 ring-accent' : 'bg-surface ring-accent/15'
                    }`}
                  >
                    <Store className="h-4 w-4 shrink-0 text-accent" />
                    <span className="font-medium">Browse Addon Store</span>
                    <span className="text-xs text-muted">Search & install from Stremio's public collection</span>
                  </div>
                )
              }
              if (row.kind === 'quickAddTorrentio') {
                return (
                  <div
                    key="quickAddTorrentio"
                    ref={(el) => (addonRowRefs.current[i] = el)}
                    onClick={() => {
                      setZone('list')
                      setAddonFocusIndex(i)
                      void quickAddTorrentio()
                    }}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-5 py-4 ring-1 transition-colors ${
                      focused ? 'bg-surface-hi shadow-focus ring-2 ring-accent' : 'bg-surface ring-accent/15'
                    }`}
                  >
                    <Download className="h-4 w-4 shrink-0" />
                    <span className="font-medium">Quick Add Torrentio</span>
                    <span className="text-xs text-muted">Public, no account needed</span>
                  </div>
                )
              }
              if (row.kind === 'addCustom') {
                return (
                  <div
                    key="addCustom"
                    ref={(el) => (addonRowRefs.current[i] = el)}
                    onClick={() => {
                      setZone('list')
                      setAddonFocusIndex(i)
                      openKeyboard('', 'addonUrl')
                    }}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-5 py-4 ring-1 transition-colors ${
                      focused ? 'bg-surface-hi shadow-focus ring-2 ring-accent' : 'bg-surface ring-accent/15'
                    }`}
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="font-medium">Add Addon URL</span>
                  </div>
                )
              }
              return (
                <div
                  key={row.addon.url}
                  ref={(el) => (addonRowRefs.current[i] = el)}
                  onClick={() => {
                    setZone('list')
                    setAddonFocusIndex(i)
                    void removeAddon(row.addon)
                  }}
                  className={`flex cursor-pointer items-center justify-between rounded-xl px-5 py-4 ring-1 transition-colors ${
                    focused ? 'bg-surface-hi shadow-focus ring-2 ring-accent' : 'bg-surface ring-accent/15'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{row.addon.name}</span>
                    <span className="text-xs text-muted">{describeAddonCapabilities(row.addon.resources)}</span>
                  </div>
                  <Trash2 className="h-4 w-4 shrink-0 text-muted" />
                </div>
              )
            })}
          </div>
        </>
      )}

      <footer className="text-sm text-muted">{message}</footer>

      {zone === 'keyboard' && (
        <OnScreenKeyboard
          label={kbPurpose === 'addonUrl' ? 'Addon Manifest URL' : 'Search Addon Store'}
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
