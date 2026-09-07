import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Check, Film, Package2, Plus, Star, Tv, X, type LucideIcon } from 'lucide-react'
import { CategoryRow } from '../components/CategoryRow'
import { FocusableCard, type CardItem } from '../components/FocusableCard'
import { CloseButton } from '../components/NavButtons'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { KEY_ROWS, applyKey, clampKeyboardFocus } from '../components/onScreenKeyboardLayout'
import { useNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'
import type { CatalogItem, CatalogType } from '@shared/stremioTypes'
import type { NewTvHomeBlock, ResolvedTvHomeBlock, TvHomeConfig } from '@shared/tvHomeTypes'

const GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama',
  'Family', 'Fantasy', 'History', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller'
]

const TAB_LABELS: Record<'movie' | 'series' | 'library' | 'addons', string> = {
  movie: 'Movies',
  series: 'Series',
  library: 'Library',
  addons: 'Addons'
}

// The browsing tabs' "Card Size" theme setting scales --card-scale, which
// CategoryRow's rows read directly (see CategoryRow.tsx) — but this page's
// standalone pinned-title/shortcut card blocks below use fixed w-44/w-72
// wrappers that never read that var, so a "Large" browsing card size blew
// the rows up huge while the standalone cards stayed put, and (on displays
// where that mismatch pushed a row wider than the viewport) clipped content
// with no way to reach it. Pinning it back to 1 for this whole page keeps
// its own rows and cards sized consistently with each other, independent of
// whatever the user picks for Movies/Series/Store elsewhere.
const NEUTRAL_CARD_SCALE = { '--card-scale': '1' } as CSSProperties

function toCardItem(item: CatalogItem): CardItem {
  return {
    id: item.id,
    title: item.name,
    subtitle: item.year ?? undefined,
    imageUrl: item.poster ?? undefined,
    icon: item.type === 'movie' ? Film : Tv,
    gradientDirection: 'bg-gradient-to-br'
  }
}

/** One flat, self-contained "add this" action — see ADD_MENU_ITEMS below.
 * `build` returns the new block to persist directly (no further steps) or
 * null when picking it should instead move into one of the follow-up
 * zones (genrePick/addonCatalogPick/tabPick/pagePick/titleResults). */
interface AddMenuItem {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  build?: () => NewTvHomeBlock
}

type Zone =
  | 'pills'
  | 'content'
  | 'blockMenu'
  | 'pageMenu'
  | 'confirmDeletePage'
  | 'addMenu'
  | 'genrePick'
  | 'addonCatalogPick'
  | 'tabPick'
  | 'pagePick'
  | 'titleResults'
  | 'keyboard'

interface AddonCatalogOption {
  addonUrl: string
  addonName: string
  catalogType: CatalogType
  catalogId: string
  catalogName: string
}

interface TvHomePageProps {
  /** True only while TvScreen's own zone is 'myTvHome' — this component is
   * actually mounted any time tab==='myTv' (so mouse clicks always work,
   * same as the Addons panel/rows being clickable regardless of zone), but
   * its nav listener must stay inert until TvScreen actually hands off
   * D-pad/keyboard focus, or both listeners would process the same event
   * (they're both subscribed with screenId='tv' — see navBus.ts). */
  active: boolean
  /** Fired on every click anywhere in this component (via onClickCapture,
   * so it fires even through a modal's own stopPropagation) — the mouse
   * equivalent of pressing Down from the shared tab row: tells TvScreen to
   * flip its zone to 'myTvHome' so focus/back-button behavior stays correct
   * even if the user switches from mouse to controller mid-session. */
  onActivate: () => void
  /** Back/Menu from the page-pills row (nothing above it to move focus to
   * within this component) — hands focus back to TvScreen's shared tab row. */
  onExit: () => void
  onSelectItem: (item: CatalogItem) => void
  onGoToTab: (tab: 'movie' | 'series' | 'library' | 'addons') => void
}

/**
 * The user-built custom TV homepage — a stack of rows/cards the user
 * assembles themselves (see shared/tvHomeTypes.ts), rendered here and
 * persisted through window.api.tvHome. Slots into the same content-area
 * position the Addons panel/browse rows already occupy (TvScreen.tsx's
 * tab-conditional render) rather than replacing the whole screen — the
 * shared header and tab row above it are untouched.
 */
export function TvHomePage({ active, onActivate, onExit, onSelectItem, onGoToTab }: TvHomePageProps): JSX.Element {
  const setMessage = useStatusStore((s) => s.setMessage)
  const message = useStatusStore((s) => s.message)

  const [config, setConfig] = useState<TvHomeConfig | null>(null)
  const [resolved, setResolved] = useState<ResolvedTvHomeBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)

  const [zone, setZone] = useState<Zone>('content')
  const [pillIndex, setPillIndex] = useState(0)
  const [blockIndex, setBlockIndex] = useState(0)
  const [itemIndex, setItemIndex] = useState(0)
  const [blockMenuIndex, setBlockMenuIndex] = useState(0)
  const [pageMenuIndex, setPageMenuIndex] = useState(0)
  const [deletePageConfirmIndex, setDeletePageConfirmIndex] = useState(0)
  const [addMenuIndex, setAddMenuIndex] = useState(0)
  const [subPickIndex, setSubPickIndex] = useState(0)
  const [genrePickType, setGenrePickType] = useState<CatalogType>('movie')
  const [addonCatalogOptions, setAddonCatalogOptions] = useState<AddonCatalogOption[]>([])
  const [titleResults, setTitleResults] = useState<CatalogItem[]>([])

  const [kbValue, setKbValue] = useState('')
  const [kbShift, setKbShift] = useState(false)
  const [kbRow, setKbRow] = useState(0)
  const [kbCol, setKbCol] = useState(0)
  const [kbPurpose, setKbPurpose] = useState<'newPage' | 'renamePage' | 'titleSearch'>('newPage')

  // Scroll-follows-focus refs — same ref-array + scrollIntoView pairing
  // TvScreen.tsx already uses for every one of its own focus-driven lists
  // (addonStoreRefs, expandedRefs, rowRefs, ...). Without these, a D-pad
  // selection can move past the edge of a scrolling container with no way
  // to see (or reach) it, which is exactly what was reported for the Add
  // menu. The pill row itself (Edit/Done + page pills + New Page) doesn't
  // need one of these — it wraps instead of scrolling, so everything is
  // always already visible without having to be scrolled to (see its own
  // render site for why: a scrolling row's clip boundary is exactly the bug
  // that kept cutting the focus ring off).
  const blockRefs = useRef<Array<HTMLElement | null>>([])
  const addMenuRefs = useRef<Array<HTMLDivElement | null>>([])
  const genreRefs = useRef<Array<HTMLDivElement | null>>([])
  const addonCatalogRefs = useRef<Array<HTMLDivElement | null>>([])
  const pagePickRefs = useRef<Array<HTMLDivElement | null>>([])
  const titleResultsRefs = useRef<Array<HTMLDivElement | null>>([])

  const activePage = config?.pages.find((p) => p.id === config.activePageId) ?? null

  function refreshConfig(next: TvHomeConfig): void {
    setConfig(next)
  }

  // Toggling edit mode changes how many focusable slots the content zone
  // has (the "+ Add Row or Card" tile only exists while editing) — a stale
  // blockIndex left pointing at that tile right as edit mode turns off
  // would have nothing real to focus until the next up/down press reclamps
  // it, so this clamps immediately instead of leaving a beat of "nothing's
  // focused".
  function toggleEditMode(): void {
    const next = !editMode
    setEditMode(next)
    setBlockIndex((i) => Math.max(0, Math.min(i, resolved.length - 1 + (next ? 1 : 0))))
  }

  async function loadAll(): Promise<void> {
    setLoading(true)
    try {
      const cfg = await window.api.tvHome.getConfig()
      setConfig(cfg)
      const blocks = await window.api.tvHome.resolvePage(cfg.activePageId)
      setResolved(blocks)
    } catch {
      setMessage("Couldn't load your TV page")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshResolved(pageId: string): Promise<void> {
    try {
      setResolved(await window.api.tvHome.resolvePage(pageId))
    } catch {
      setResolved([])
    }
  }

  async function switchToPage(pageId: string): Promise<void> {
    const next = await window.api.tvHome.setActivePage(pageId)
    refreshConfig(next)
    setBlockIndex(0)
    setItemIndex(0)
    await refreshResolved(pageId)
  }

  async function createPage(name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) {
      setZone('pills')
      return
    }
    setMessage(`Creating "${trimmed}"...`)
    const next = await window.api.tvHome.addPage(trimmed)
    refreshConfig(next)
    setBlockIndex(0)
    setItemIndex(0)
    await refreshResolved(next.activePageId)
    setMessage(`Created "${trimmed}"`)
    // The keyboard flow (submitKeyboard) never leaves 'keyboard' zone on its
    // own for this purpose — unlike title search, which has its own results
    // zone to land in, creating a page has nowhere else to go but back to
    // the pill row, now showing the new page selected.
    setZone('pills')
  }

  // pillIndex still points at the right pill throughout the rename flow —
  // nothing else can move it while the keyboard/pageMenu modals are up.
  async function submitRenamePage(name: string): Promise<void> {
    const trimmed = name.trim()
    const target = (config?.pages ?? [])[pillIndex]
    if (!trimmed || !target) {
      setZone('pageMenu')
      return
    }
    const next = await window.api.tvHome.renamePage(target.id, trimmed)
    refreshConfig(next)
    setMessage(`Renamed to "${trimmed}"`)
    setZone('pills')
  }

  async function deleteTargetPage(): Promise<void> {
    const target = (config?.pages ?? [])[pillIndex]
    if (!target) return
    const before = config?.pages.length ?? 0
    const next = await window.api.tvHome.removePage(target.id)
    refreshConfig(next)
    // removePage silently no-ops rather than leaving zero pages — this is
    // the one place that no-op needs its own feedback instead of reading as
    // "nothing happened" with no explanation.
    if (next.pages.length === before) {
      setMessage("Can't delete your only page")
      setZone('pageMenu')
      return
    }
    // Points at wherever the *active* page actually landed, not just
    // whatever pillIndex used to be — deleting a page earlier in the list
    // shifts every later index by one, so a plain clamp could leave the
    // focus ring sitting on the wrong pill even though the right page is
    // still what's showing as content.
    setPillIndex(Math.max(0, next.pages.findIndex((p) => p.id === next.activePageId)))
    setBlockIndex(0)
    setItemIndex(0)
    await refreshResolved(next.activePageId)
    setMessage(`Deleted "${target.name}"`)
    setZone('pills')
  }

  async function commitBlock(block: NewTvHomeBlock): Promise<void> {
    if (!activePage) return
    const next = await window.api.tvHome.addBlock(activePage.id, block)
    refreshConfig(next)
    await refreshResolved(activePage.id)
    setZone('content')
    setMessage('Added')
  }

  async function removeFocusedBlock(): Promise<void> {
    const block = resolved[blockIndex]
    if (!activePage || !block) return
    const next = await window.api.tvHome.removeBlock(activePage.id, block.id)
    refreshConfig(next)
    await refreshResolved(activePage.id)
    setBlockIndex((i) => Math.max(0, Math.min(i, next.pages.find((p) => p.id === activePage.id)!.blocks.length - 1)))
    setZone('content')
    setMessage('Removed')
  }

  async function moveFocusedBlock(direction: 1 | -1): Promise<void> {
    const block = resolved[blockIndex]
    if (!activePage || !block) return
    const next = await window.api.tvHome.moveBlock(activePage.id, block.id, direction)
    refreshConfig(next)
    await refreshResolved(activePage.id)
    setBlockIndex((i) => Math.max(0, Math.min(i + direction, resolved.length - 1)))
    setZone('content')
  }

  async function loadAddonCatalogOptions(): Promise<AddonCatalogOption[]> {
    try {
      const { addons } = await window.api.settings.getStremio()
      const options: AddonCatalogOption[] = []
      for (const addon of addons) {
        if (!addon.resources.includes('catalog')) continue
        for (const cat of addon.catalogs ?? []) {
          options.push({
            addonUrl: addon.url,
            addonName: addon.name,
            catalogType: cat.type,
            catalogId: cat.id,
            catalogName: cat.name
          })
        }
      }
      return options
    } catch {
      return []
    }
  }

  const ADD_MENU_ITEMS: AddMenuItem[] = [
    {
      id: 'popularMovies',
      label: 'Popular Movies',
      hint: 'Row',
      icon: Film,
      build: () => ({ kind: 'row', label: 'Popular Movies', source: { kind: 'catalog', catalogType: 'movie', catalogId: 'top' } })
    },
    {
      id: 'newMovies',
      label: 'New Movies',
      hint: 'Row',
      icon: Film,
      build: () => ({ kind: 'row', label: 'New Movies', source: { kind: 'catalog', catalogType: 'movie', catalogId: 'year' } })
    },
    {
      id: 'topRatedMovies',
      label: 'Top Rated Movies',
      hint: 'Row',
      icon: Star,
      build: () => ({ kind: 'row', label: 'Top Rated Movies', source: { kind: 'catalog', catalogType: 'movie', catalogId: 'imdbRating' } })
    },
    {
      id: 'popularSeries',
      label: 'Popular Series',
      hint: 'Row',
      icon: Tv,
      build: () => ({ kind: 'row', label: 'Popular Series', source: { kind: 'catalog', catalogType: 'series', catalogId: 'top' } })
    },
    {
      id: 'newSeries',
      label: 'New Series',
      hint: 'Row',
      icon: Tv,
      build: () => ({ kind: 'row', label: 'New Series', source: { kind: 'catalog', catalogType: 'series', catalogId: 'year' } })
    },
    {
      id: 'topRatedSeries',
      label: 'Top Rated Series',
      hint: 'Row',
      icon: Star,
      build: () => ({ kind: 'row', label: 'Top Rated Series', source: { kind: 'catalog', catalogType: 'series', catalogId: 'imdbRating' } })
    },
    { id: 'moviesByGenre', label: 'Movies by Genre...', hint: 'Row', icon: Film },
    { id: 'seriesByGenre', label: 'Series by Genre...', hint: 'Row', icon: Tv },
    { id: 'addonCatalog', label: 'Addon Catalog...', hint: 'Row', icon: Package2 },
    {
      id: 'continueWatching',
      label: 'Continue Watching',
      hint: 'Row',
      icon: Check,
      build: () => ({ kind: 'row', label: 'Continue Watching', source: { kind: 'continueWatching' } })
    },
    {
      id: 'library',
      label: 'My Library',
      hint: 'Row',
      icon: Check,
      build: () => ({ kind: 'row', label: 'My Library', source: { kind: 'library' } })
    },
    { id: 'pinTitle', label: 'Pin a Movie or Series...', hint: 'Card', icon: Star },
    { id: 'tabShortcut', label: 'Shortcut to a Tab...', hint: 'Card', icon: Package2 },
    { id: 'pageShortcut', label: 'Shortcut to Another Page...', hint: 'Card', icon: Package2 }
  ]

  function activateAddMenuItem(item: AddMenuItem): void {
    if (item.build) {
      void commitBlock(item.build())
      return
    }
    if (item.id === 'moviesByGenre') {
      setGenrePickType('movie')
      setSubPickIndex(0)
      setZone('genrePick')
    } else if (item.id === 'seriesByGenre') {
      setGenrePickType('series')
      setSubPickIndex(0)
      setZone('genrePick')
    } else if (item.id === 'addonCatalog') {
      void loadAddonCatalogOptions().then((options) => {
        setAddonCatalogOptions(options)
        setSubPickIndex(0)
        setZone('addonCatalogPick')
      })
    } else if (item.id === 'pinTitle') {
      setKbValue('')
      setKbShift(false)
      setKbRow(0)
      setKbCol(0)
      setKbPurpose('titleSearch')
      setZone('keyboard')
    } else if (item.id === 'tabShortcut') {
      setSubPickIndex(0)
      setZone('tabPick')
    } else if (item.id === 'pageShortcut') {
      setSubPickIndex(0)
      setZone('pagePick')
    }
  }

  async function submitTitleSearch(query: string): Promise<void> {
    const trimmed = query.trim()
    if (!trimmed) {
      setZone('addMenu')
      return
    }
    setMessage(`Searching for "${trimmed}"...`)
    try {
      const [movies, series] = await Promise.all([
        window.api.stremio.search('movie', trimmed),
        window.api.stremio.search('series', trimmed)
      ])
      setTitleResults([...movies, ...series])
      setSubPickIndex(0)
      setZone('titleResults')
      setMessage('Ready')
    } catch (error) {
      setMessage(`Search failed: ${error instanceof Error ? error.message : String(error)}`)
      setZone('addMenu')
    }
  }

  function submitKeyboard(finalValue: string): void {
    if (kbPurpose === 'newPage') void createPage(finalValue)
    else if (kbPurpose === 'renamePage') void submitRenamePage(finalValue)
    else void submitTitleSearch(finalValue)
  }

  function cancelKeyboard(): void {
    if (kbPurpose === 'newPage') setZone('pills')
    else if (kbPurpose === 'renamePage') setZone('pageMenu')
    else setZone('addMenu')
  }

  function pressVirtualKey(key: string): void {
    const result = applyKey(key, kbValue, kbShift)
    setKbValue(result.value)
    setKbShift(result.shift)
    if (result.done) submitKeyboard(result.value)
  }

  const otherPages = (config?.pages ?? []).filter((p) => p.id !== activePage?.id)

  // The content zone (rows/cards, in or out of edit mode) never had this at
  // all — moving blockIndex just moved which item was highlighted, with
  // nothing to bring it into view once it scrolled past the edge, on either
  // a controller or a keyboard. Every other focus-driven list in this app
  // (and now every one in this file too) already follows this same pattern.
  useEffect(() => {
    if (zone !== 'content') return
    blockRefs.current[blockIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, blockIndex])

  useEffect(() => {
    if (zone !== 'addMenu') return
    addMenuRefs.current[addMenuIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, addMenuIndex])

  useEffect(() => {
    if (zone !== 'genrePick') return
    genreRefs.current[subPickIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, subPickIndex])

  useEffect(() => {
    if (zone !== 'addonCatalogPick') return
    addonCatalogRefs.current[subPickIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, subPickIndex])

  useEffect(() => {
    if (zone !== 'pagePick') return
    pagePickRefs.current[subPickIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, subPickIndex])

  useEffect(() => {
    if (zone !== 'titleResults') return
    titleResultsRefs.current[subPickIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [zone, subPickIndex])

  useNavListener((action) => {
    if (!active) return
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

    if (zone === 'addMenu') {
      switch (action) {
        case 'up':
          setAddMenuIndex((i) => Math.max(0, i - 1))
          return
        case 'down':
          setAddMenuIndex((i) => Math.min(ADD_MENU_ITEMS.length - 1, i + 1))
          return
        case 'confirm':
          activateAddMenuItem(ADD_MENU_ITEMS[addMenuIndex])
          return
        case 'back':
        case 'menu':
          setZone('content')
          return
        default:
          return
      }
    }

    if (zone === 'genrePick') {
      switch (action) {
        case 'up':
          setSubPickIndex((i) => Math.max(0, i - 1))
          return
        case 'down':
          setSubPickIndex((i) => Math.min(GENRES.length - 1, i + 1))
          return
        case 'confirm': {
          const genre = GENRES[subPickIndex]
          void commitBlock({
            kind: 'row',
            label: `${genre} ${genrePickType === 'movie' ? 'Movies' : 'Series'}`,
            source: { kind: 'catalog', catalogType: genrePickType, catalogId: 'top', genre }
          })
          return
        }
        case 'back':
        case 'menu':
          setZone('addMenu')
          return
        default:
          return
      }
    }

    if (zone === 'addonCatalogPick') {
      switch (action) {
        case 'up':
          setSubPickIndex((i) => Math.max(0, i - 1))
          return
        case 'down':
          setSubPickIndex((i) => Math.min(Math.max(0, addonCatalogOptions.length - 1), i + 1))
          return
        case 'confirm': {
          const option = addonCatalogOptions[subPickIndex]
          if (!option) return
          void commitBlock({
            kind: 'row',
            label: `${option.addonName}: ${option.catalogName}`,
            source: {
              kind: 'addonCatalog',
              addonUrl: option.addonUrl,
              catalogType: option.catalogType,
              catalogId: option.catalogId
            }
          })
          return
        }
        case 'back':
        case 'menu':
          setZone('addMenu')
          return
        default:
          return
      }
    }

    if (zone === 'tabPick') {
      const tabs: Array<'movie' | 'series' | 'library' | 'addons'> = ['movie', 'series', 'library', 'addons']
      switch (action) {
        case 'up':
          setSubPickIndex((i) => Math.max(0, i - 1))
          return
        case 'down':
          setSubPickIndex((i) => Math.min(tabs.length - 1, i + 1))
          return
        case 'confirm':
          void commitBlock({ kind: 'card', card: { kind: 'tabShortcut', tab: tabs[subPickIndex] } })
          return
        case 'back':
        case 'menu':
          setZone('addMenu')
          return
        default:
          return
      }
    }

    if (zone === 'pagePick') {
      switch (action) {
        case 'up':
          setSubPickIndex((i) => Math.max(0, i - 1))
          return
        case 'down':
          setSubPickIndex((i) => Math.min(Math.max(0, otherPages.length - 1), i + 1))
          return
        case 'confirm': {
          const page = otherPages[subPickIndex]
          if (!page) return
          void commitBlock({ kind: 'card', card: { kind: 'pageShortcut', pageId: page.id } })
          return
        }
        case 'back':
        case 'menu':
          setZone('addMenu')
          return
        default:
          return
      }
    }

    if (zone === 'titleResults') {
      switch (action) {
        case 'up':
          setSubPickIndex((i) => Math.max(0, i - 1))
          return
        case 'down':
          setSubPickIndex((i) => Math.min(Math.max(0, titleResults.length - 1), i + 1))
          return
        case 'confirm': {
          const item = titleResults[subPickIndex]
          if (!item) return
          void commitBlock({ kind: 'card', card: { kind: 'pinnedTitle', id: item.id, type: item.type } })
          return
        }
        case 'back':
        case 'menu':
          setZone('addMenu')
          return
        default:
          return
      }
    }

    if (zone === 'blockMenu') {
      const options = ['Move Up', 'Move Down', 'Remove']
      switch (action) {
        case 'up':
          setBlockMenuIndex((i) => (i === 0 ? options.length - 1 : i - 1))
          return
        case 'down':
          setBlockMenuIndex((i) => (i + 1) % options.length)
          return
        case 'confirm':
          if (blockMenuIndex === 0) void moveFocusedBlock(-1)
          else if (blockMenuIndex === 1) void moveFocusedBlock(1)
          else void removeFocusedBlock()
          return
        case 'back':
        case 'menu':
          setZone('content')
          return
        default:
          return
      }
    }

    if (zone === 'pills') {
      const pillCount = (config?.pages.length ?? 0) + 1 // + the "New Page" pill
      switch (action) {
        case 'left':
          // -1 is the Edit/Done button — a genuine D-pad stop just left of
          // the first page pill, not just the hidden contextMenu shortcut.
          setPillIndex((i) => Math.max(-1, i - 1))
          return
        case 'right':
          setPillIndex((i) => Math.min(pillCount - 1, i + 1))
          return
        case 'down':
          setZone('content')
          return
        case 'confirm': {
          if (pillIndex === -1) {
            toggleEditMode()
            return
          }
          const pages = config?.pages ?? []
          if (pillIndex === pages.length) {
            setKbValue('')
            setKbShift(false)
            setKbRow(0)
            setKbCol(0)
            setKbPurpose('newPage')
            setZone('keyboard')
          } else if (editMode) {
            // Same "edit mode changes what Confirm does" rule blocks already
            // use — a real page pill opens Rename/Delete instead of
            // switching, so managing a page doesn't require first hunting
            // for a separate button.
            setPageMenuIndex(0)
            setZone('pageMenu')
          } else {
            void switchToPage(pages[pillIndex].id)
          }
          return
        }
        case 'contextMenu':
          toggleEditMode()
          return
        case 'back':
        case 'menu':
          onExit()
          return
        default:
          return
      }
    }

    if (zone === 'pageMenu') {
      const options = ['Rename', 'Delete']
      switch (action) {
        case 'up':
          setPageMenuIndex((i) => (i === 0 ? options.length - 1 : i - 1))
          return
        case 'down':
          setPageMenuIndex((i) => (i + 1) % options.length)
          return
        case 'confirm': {
          const target = (config?.pages ?? [])[pillIndex]
          if (!target) return
          if (pageMenuIndex === 0) {
            setKbValue(target.name)
            setKbShift(false)
            setKbRow(0)
            setKbCol(0)
            setKbPurpose('renamePage')
            setZone('keyboard')
          } else {
            setDeletePageConfirmIndex(0)
            setZone('confirmDeletePage')
          }
          return
        }
        case 'back':
        case 'menu':
          setZone('pills')
          return
        default:
          return
      }
    }

    if (zone === 'confirmDeletePage') {
      switch (action) {
        case 'left':
        case 'right':
          setDeletePageConfirmIndex((i) => (i === 0 ? 1 : 0))
          return
        case 'confirm':
          if (deletePageConfirmIndex === 0) void deleteTargetPage()
          else setZone('pageMenu')
          return
        case 'back':
        case 'menu':
          setZone('pageMenu')
          return
        default:
          return
      }
    }

    // zone === 'content'
    const blockCount = resolved.length + (editMode ? 1 : 0) // + the "Add Block" tile while editing
    switch (action) {
      case 'up':
        if (blockIndex === 0) setZone('pills')
        else {
          setBlockIndex((i) => i - 1)
          setItemIndex(0)
        }
        return
      case 'down':
        setBlockIndex((i) => Math.min(blockCount - 1, i + 1))
        setItemIndex(0)
        return
      case 'left':
        if (!editMode) {
          const block = resolved[blockIndex]
          if (block?.kind === 'row') setItemIndex((i) => Math.max(0, i - 1))
        }
        return
      case 'right':
        if (!editMode) {
          const block = resolved[blockIndex]
          if (block?.kind === 'row') {
            const len = block.items.length
            setItemIndex((i) => Math.min(Math.max(0, len - 1), i + 1))
          }
        }
        return
      case 'confirm': {
        // Empty page: the on-screen banner says "press Confirm" — this is
        // what makes that true for gamepad/keyboard too, not just its own
        // onClick. Checked before the resolved[blockIndex] lookup below,
        // which would otherwise just find nothing and silently no-op.
        if (resolved.length === 0 && !editMode) {
          setEditMode(true)
          setAddMenuIndex(0)
          setZone('addMenu')
          return
        }
        if (editMode && blockIndex === resolved.length) {
          setAddMenuIndex(0)
          setZone('addMenu')
          return
        }
        const block = resolved[blockIndex]
        if (!block) return
        if (editMode) {
          setBlockMenuIndex(0)
          setZone('blockMenu')
          return
        }
        if (block.kind === 'row') {
          const item = block.items[itemIndex]
          if (item) onSelectItem(item)
        } else if (block.card.kind === 'pinnedTitle') {
          if (block.card.item) onSelectItem(block.card.item)
        } else if (block.card.kind === 'tabShortcut') {
          onGoToTab(block.card.tab)
        } else {
          void switchToPage(block.card.pageId)
        }
        return
      }
      case 'contextMenu':
        toggleEditMode()
        return
      case 'back':
      case 'menu':
        if (editMode) toggleEditMode()
        else onExit()
        return
      default:
        return
    }
  }, 'tv')

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted">Loading your TV page...</p>
      </div>
    )
  }

  const pages = config?.pages ?? []
  const isEmpty = resolved.length === 0

  return (
    <div
      className="relative flex flex-1 flex-col gap-5 overflow-hidden"
      style={NEUTRAL_CARD_SCALE}
      onClickCapture={onActivate}
    >
      {/* flex-wrap, not a scrolling row — a scrolling container has to clip
          somewhere, and there's no padding number that's guaranteed to stay
          ahead of a focus ring/glow forever (the exact bug this row already
          had once). Wrapping to a second line instead of scrolling means
          nothing here ever needs an overflow clip at all, so nothing can cut
          a ring off no matter how many pages exist. Sized deliberately
          smaller than a typical row's cards — this is a nav control, not
          content, and didn't need to take up as much of the screen as it was. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <button
          type="button"
          onClick={() => {
            setPillIndex(-1)
            toggleEditMode()
          }}
          className={`shrink-0 rounded-control px-3 py-1 text-xs font-semibold transition-colors ${
            editMode ? 'bg-accent text-white' : 'bg-surface-hi text-muted hover:text-white'
          } ${zone === 'pills' && pillIndex === -1 ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}
        >
          {editMode ? 'Done Editing' : 'Edit Page'}
        </button>
        <div className="h-4 w-px shrink-0 bg-white/10" />
        {pages.map((page, i) => (
          <span
            key={page.id}
            onClick={() => {
              setPillIndex(i)
              if (editMode) {
                setPageMenuIndex(0)
                setZone('pageMenu')
              } else {
                void switchToPage(page.id)
              }
            }}
            className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              page.id === activePage?.id ? 'bg-accent text-white' : 'bg-surface text-muted'
            } ${zone === 'pills' && pillIndex === i ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}
          >
            {page.name}
          </span>
        ))}
        <span
          onClick={() => {
            setPillIndex(pages.length)
            setKbValue('')
            setKbShift(false)
            setKbRow(0)
            setKbCol(0)
            setKbPurpose('newPage')
            setZone('keyboard')
          }}
          className={`flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted transition-colors hover:text-white ${
            zone === 'pills' && pillIndex === pages.length ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''
          }`}
        >
          <Plus className="h-3 w-3" /> New Page
        </span>
      </div>

      {isEmpty && !editMode && (
        <div
          onClick={() => {
            setEditMode(true)
            setAddMenuIndex(0)
            setZone('addMenu')
          }}
          className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-panel bg-surface/50 text-center ring-2 ring-dashed ring-accent/30 transition-colors hover:bg-surface"
        >
          <Plus className="h-10 w-10 text-accent" />
          <p className="text-lg font-semibold">This page is empty</p>
          <p className="max-w-sm text-sm text-muted">
            Press Confirm (or click here) to add your first row or card — pick from catalogs, addons, Continue
            Watching, your Library, or pin a specific title.
          </p>
        </div>
      )}

      {!isEmpty && (
        <div className="flex flex-1 flex-col gap-[max(1.5rem,var(--tile-grow-pad))] overflow-y-auto p-[var(--tile-grow-pad)]">
          {resolved.map((block, i) => {
            const isFocused = zone === 'content' && blockIndex === i
            if (block.kind === 'row') {
              return (
                <div
                  key={block.id}
                  ref={(el) => (blockRefs.current[i] = el)}
                  style={{ scrollMarginBlock: 'var(--tile-grow-pad)' }}
                  className={`rounded-panel transition-shadow ${
                    editMode && isFocused ? 'shadow-focus ring-2 ring-accent' : ''
                  }`}
                >
                  <CategoryRow
                    label={block.label}
                    items={block.items.map(toCardItem)}
                    aspect="portrait"
                    focused={!editMode && isFocused}
                    focusedIndex={isFocused ? itemIndex : 0}
                    onSelect={(index) => {
                      setBlockIndex(i)
                      setItemIndex(index)
                      if (editMode) {
                        setBlockMenuIndex(0)
                        setZone('blockMenu')
                      } else {
                        const item = block.items[index]
                        if (item) onSelectItem(item)
                      }
                    }}
                  />
                </div>
              )
            }

            // card block
            const cardItem: CardItem =
              block.card.kind === 'pinnedTitle'
                ? block.card.item
                  ? toCardItem(block.card.item)
                  : { id: block.id, title: 'Unavailable title', icon: X }
                : block.card.kind === 'tabShortcut'
                  ? { id: block.id, title: TAB_LABELS[block.card.tab], subtitle: 'Shortcut', icon: Package2 }
                  : {
                      id: block.id,
                      title: block.card.pageName ?? 'Page removed',
                      subtitle: 'Shortcut',
                      icon: Package2
                    }

            // Pinned titles carry a real poster (portrait, like every other
            // movie/series image in this app) — size="large" forces a wide
            // landscape frame regardless of the `aspect` prop (see
            // FocusableCard.tsx), which crops a portrait poster down to an
            // unrecognizable horizontal sliver. Shortcuts have no photo at
            // all (icon-on-gradient only), so the wide tile reads fine there
            // — same look as Home's own app tiles, which this literally is.
            const isPinnedTitle = block.card.kind === 'pinnedTitle'
            return (
              <div
                key={block.id}
                ref={(el) => (blockRefs.current[i] = el)}
                style={{ scrollMarginBlock: 'var(--tile-grow-pad)' }}
                className={isPinnedTitle ? 'w-44' : 'w-72'}
              >
                <FocusableCard
                  item={cardItem}
                  size={isPinnedTitle ? 'default' : 'large'}
                  aspect={isPinnedTitle ? 'portrait' : undefined}
                  focused={isFocused}
                  onClick={() => {
                    setBlockIndex(i)
                    if (editMode) {
                      setBlockMenuIndex(0)
                      setZone('blockMenu')
                      return
                    }
                    if (block.card.kind === 'pinnedTitle') {
                      if (block.card.item) onSelectItem(block.card.item)
                    } else if (block.card.kind === 'tabShortcut') {
                      onGoToTab(block.card.tab)
                    } else {
                      void switchToPage(block.card.pageId)
                    }
                  }}
                />
              </div>
            )
          })}

          {editMode && (
            <div
              ref={(el) => (blockRefs.current[resolved.length] = el)}
              style={{ scrollMarginBlock: 'var(--tile-grow-pad)' }}
              onClick={() => {
                setBlockIndex(resolved.length)
                setAddMenuIndex(0)
                setZone('addMenu')
              }}
              className={`flex w-72 cursor-pointer items-center justify-center gap-2 rounded-card border-2 border-dashed py-10 text-sm font-semibold transition-colors ${
                zone === 'content' && blockIndex === resolved.length
                  ? 'shadow-focus border-accent text-accent'
                  : 'border-white/10 text-muted'
              }`}
            >
              <Plus className="h-5 w-5" /> Add Row or Card
            </div>
          )}
        </div>
      )}

      <footer className="text-sm text-muted">{message}</footer>

      {zone === 'addMenu' && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70" onClick={() => setZone('content')}>
          <div onClick={(e) => e.stopPropagation()} className="relative flex max-h-[80vh] w-96 flex-col gap-2 overflow-y-auto rounded-panel bg-surface p-6">
            <CloseButton className="absolute right-4 top-4" onClick={() => setZone('content')} />
            <h2 className="mb-2 pr-8 text-lg font-semibold">Add to {activePage?.name}</h2>
            {ADD_MENU_ITEMS.map((item, i) => (
              <div
                key={item.id}
                ref={(el) => (addMenuRefs.current[i] = el)}
                onClick={() => activateAddMenuItem(item)}
                className={`scroll-m-2 flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 transition-colors ${
                  addMenuIndex === i && zone === 'addMenu' ? 'bg-accent text-white' : 'bg-surface-hi text-muted hover:text-white'
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 font-medium">{item.label}</span>
                <span className="text-xs opacity-70">{item.hint}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {zone === 'genrePick' && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70" onClick={() => setZone('addMenu')}>
          <div onClick={(e) => e.stopPropagation()} className="relative flex max-h-[80vh] w-80 flex-col gap-2 overflow-y-auto rounded-panel bg-surface p-6">
            <CloseButton className="absolute right-4 top-4" onClick={() => setZone('addMenu')} />
            <h2 className="mb-2 pr-8 text-lg font-semibold">Pick a Genre</h2>
            {GENRES.map((genre, i) => (
              <div
                key={genre}
                ref={(el) => (genreRefs.current[i] = el)}
                onClick={() =>
                  void commitBlock({
                    kind: 'row',
                    label: `${genre} ${genrePickType === 'movie' ? 'Movies' : 'Series'}`,
                    source: { kind: 'catalog', catalogType: genrePickType, catalogId: 'top', genre }
                  })
                }
                className={`scroll-m-2 cursor-pointer rounded-xl px-4 py-3 font-medium transition-colors ${
                  subPickIndex === i ? 'bg-accent text-white' : 'bg-surface-hi text-muted hover:text-white'
                }`}
              >
                {genre}
              </div>
            ))}
          </div>
        </div>
      )}

      {zone === 'addonCatalogPick' && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70" onClick={() => setZone('addMenu')}>
          <div onClick={(e) => e.stopPropagation()} className="relative flex max-h-[80vh] w-96 flex-col gap-2 overflow-y-auto rounded-panel bg-surface p-6">
            <CloseButton className="absolute right-4 top-4" onClick={() => setZone('addMenu')} />
            <h2 className="mb-2 pr-8 text-lg font-semibold">Pick an Addon Catalog</h2>
            {addonCatalogOptions.length === 0 && (
              <p className="text-sm text-muted">
                No catalog addons installed yet — add one from the Addons tab's Addon Store first.
              </p>
            )}
            {addonCatalogOptions.map((option, i) => (
              <div
                key={`${option.addonUrl}:${option.catalogId}`}
                ref={(el) => (addonCatalogRefs.current[i] = el)}
                onClick={() =>
                  void commitBlock({
                    kind: 'row',
                    label: `${option.addonName}: ${option.catalogName}`,
                    source: {
                      kind: 'addonCatalog',
                      addonUrl: option.addonUrl,
                      catalogType: option.catalogType,
                      catalogId: option.catalogId
                    }
                  })
                }
                className={`scroll-m-2 cursor-pointer rounded-xl px-4 py-3 transition-colors ${
                  subPickIndex === i ? 'bg-accent text-white' : 'bg-surface-hi text-muted hover:text-white'
                }`}
              >
                <span className="font-medium">{option.catalogName}</span>
                <span className="ml-2 text-xs opacity-70">{option.addonName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {zone === 'tabPick' && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70" onClick={() => setZone('addMenu')}>
          <div onClick={(e) => e.stopPropagation()} className="relative flex w-80 flex-col gap-2 rounded-panel bg-surface p-6">
            <CloseButton className="absolute right-4 top-4" onClick={() => setZone('addMenu')} />
            <h2 className="mb-2 pr-8 text-lg font-semibold">Shortcut to Which Tab?</h2>
            {(['movie', 'series', 'library', 'addons'] as const).map((tab, i) => (
              <div
                key={tab}
                onClick={() => void commitBlock({ kind: 'card', card: { kind: 'tabShortcut', tab } })}
                className={`cursor-pointer rounded-xl px-4 py-3 font-medium transition-colors ${
                  subPickIndex === i ? 'bg-accent text-white' : 'bg-surface-hi text-muted hover:text-white'
                }`}
              >
                {TAB_LABELS[tab]}
              </div>
            ))}
          </div>
        </div>
      )}

      {zone === 'pagePick' && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70" onClick={() => setZone('addMenu')}>
          <div onClick={(e) => e.stopPropagation()} className="relative flex max-h-[80vh] w-80 flex-col gap-2 overflow-y-auto rounded-panel bg-surface p-6">
            <CloseButton className="absolute right-4 top-4" onClick={() => setZone('addMenu')} />
            <h2 className="mb-2 pr-8 text-lg font-semibold">Shortcut to Which Page?</h2>
            {otherPages.length === 0 && <p className="text-sm text-muted">No other pages yet — create one first.</p>}
            {otherPages.map((page, i) => (
              <div
                key={page.id}
                ref={(el) => (pagePickRefs.current[i] = el)}
                onClick={() => void commitBlock({ kind: 'card', card: { kind: 'pageShortcut', pageId: page.id } })}
                className={`scroll-m-2 cursor-pointer rounded-xl px-4 py-3 font-medium transition-colors ${
                  subPickIndex === i ? 'bg-accent text-white' : 'bg-surface-hi text-muted hover:text-white'
                }`}
              >
                {page.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {zone === 'titleResults' && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70" onClick={() => setZone('addMenu')}>
          <div onClick={(e) => e.stopPropagation()} className="relative flex max-h-[80vh] w-96 flex-col gap-2 overflow-y-auto rounded-panel bg-surface p-6">
            <CloseButton className="absolute right-4 top-4" onClick={() => setZone('addMenu')} />
            <h2 className="mb-2 pr-8 text-lg font-semibold">Pick a Title to Pin</h2>
            {titleResults.length === 0 && <p className="text-sm text-muted">No results.</p>}
            {titleResults.map((item, i) => (
              <div
                key={`${item.type}:${item.id}`}
                ref={(el) => (titleResultsRefs.current[i] = el)}
                onClick={() => void commitBlock({ kind: 'card', card: { kind: 'pinnedTitle', id: item.id, type: item.type } })}
                className={`scroll-m-2 flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 transition-colors ${
                  subPickIndex === i ? 'bg-accent text-white' : 'bg-surface-hi text-muted hover:text-white'
                }`}
              >
                {item.poster && <img src={item.poster} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />}
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="text-xs opacity-70">{item.type === 'movie' ? 'Movie' : 'Series'} {item.year ?? ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {zone === 'blockMenu' && resolved[blockIndex] && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70" onClick={() => setZone('content')}>
          <div onClick={(e) => e.stopPropagation()} className="relative flex w-72 flex-col gap-2 rounded-panel bg-surface p-6">
            <CloseButton className="absolute right-4 top-4" onClick={() => setZone('content')} />
            <h2 className="mb-2 pr-8 text-lg font-semibold">
              {resolved[blockIndex].kind === 'row' ? resolved[blockIndex].label : 'Card'}
            </h2>
            {['Move Up', 'Move Down', 'Remove'].map((label, i) => (
              <div
                key={label}
                onClick={() => {
                  if (i === 0) void moveFocusedBlock(-1)
                  else if (i === 1) void moveFocusedBlock(1)
                  else void removeFocusedBlock()
                }}
                className={`cursor-pointer rounded-xl px-4 py-3 font-medium transition-colors ${
                  blockMenuIndex === i ? 'bg-accent text-white' : 'bg-surface-hi text-muted hover:text-white'
                } ${label === 'Remove' ? 'text-red-400' : ''}`}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      )}

      {zone === 'pageMenu' && (config?.pages ?? [])[pillIndex] && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70" onClick={() => setZone('pills')}>
          <div onClick={(e) => e.stopPropagation()} className="relative flex w-72 flex-col gap-2 rounded-panel bg-surface p-6">
            <CloseButton className="absolute right-4 top-4" onClick={() => setZone('pills')} />
            <h2 className="mb-2 pr-8 text-lg font-semibold">{(config?.pages ?? [])[pillIndex]?.name}</h2>
            {['Rename', 'Delete'].map((label, i) => (
              <div
                key={label}
                onClick={() => {
                  if (i === 0) {
                    const target = (config?.pages ?? [])[pillIndex]
                    if (!target) return
                    setKbValue(target.name)
                    setKbShift(false)
                    setKbRow(0)
                    setKbCol(0)
                    setKbPurpose('renamePage')
                    setZone('keyboard')
                  } else {
                    setDeletePageConfirmIndex(0)
                    setZone('confirmDeletePage')
                  }
                }}
                className={`cursor-pointer rounded-xl px-4 py-3 font-medium transition-colors ${
                  pageMenuIndex === i ? 'bg-accent text-white' : 'bg-surface-hi text-muted hover:text-white'
                } ${label === 'Delete' ? 'text-red-400' : ''}`}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      )}

      {zone === 'confirmDeletePage' && (config?.pages ?? [])[pillIndex] && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70" onClick={() => setZone('pageMenu')}>
          <div onClick={(e) => e.stopPropagation()} className="relative flex w-80 flex-col gap-4 rounded-panel bg-surface p-8">
            <h2 className="text-lg font-semibold">
              Delete "{(config?.pages ?? [])[pillIndex]?.name}"? This removes every row and card on it.
            </h2>
            <div className="flex gap-3">
              {['Delete', 'Cancel'].map((label, i) => (
                <div
                  key={label}
                  onClick={() => {
                    setDeletePageConfirmIndex(i)
                    if (i === 0) void deleteTargetPage()
                    else setZone('pageMenu')
                  }}
                  className={`flex-1 cursor-pointer rounded-xl px-5 py-3 text-center font-medium transition-colors ${
                    deletePageConfirmIndex === i ? 'bg-accent text-white' : 'bg-surface-hi text-muted'
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
          label={
            kbPurpose === 'newPage'
              ? 'New Page Name'
              : kbPurpose === 'renamePage'
                ? 'Rename Page'
                : 'Search Movies & Series'
          }
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
