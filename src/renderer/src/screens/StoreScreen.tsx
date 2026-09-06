import { useEffect, useRef, useState } from 'react'
import type { WebviewTag } from 'electron'
import { FolderOpen, Palette, RefreshCw, ShoppingCart } from 'lucide-react'
import { CategoryRow } from '../components/CategoryRow'
import { FocusableCard, type CardItem } from '../components/FocusableCard'
import { useNavListener } from '../input/useNavListener'
import { useNavigationStore } from '../state/navigationStore'
import { useStatusStore } from '../state/statusStore'
import { useThemeStore } from '../state/themeStore'
import { openThemesFolder, rescanThemesFolder } from '../themes/themeFolderActions'
import { COMMUNITY_THEMES_REPO, type CommunityThemeSummary, type ThemeDefinition } from '@shared/themeTypes'

const STORE_URL = 'https://store.steampowered.com'
const SCROLL_STEP = 160
const CURSOR_SPEED = 16
const CURSOR_DEADZONE = 0.15
const CURSOR_RADIUS = 12

function cursorTransform(x: number, y: number): string {
  return `translate(${x - CURSOR_RADIUS}px, ${y - CURSOR_RADIUS}px)`
}

function themeToCardItem(theme: ThemeDefinition, activeThemeId: string): CardItem {
  const accent = theme.vars['--color-accent'] ?? '91 140 255'
  const accent2 = theme.vars['--color-accent-2'] ?? '160 107 255'
  return {
    id: `theme:${theme.id}`,
    title: theme.name,
    subtitle: theme.id === activeThemeId ? 'Active' : 'Tap to Apply',
    imageUrl: theme.heroImage,
    icon: Palette,
    iconColors: [`rgb(${accent})`, `rgb(${accent2})`]
  }
}

function communityThemeToCardItem(theme: CommunityThemeSummary): CardItem {
  return {
    id: `community:${theme.folder}`,
    title: theme.name,
    subtitle: 'Tap to Install',
    imageUrl: theme.previewUrl ?? undefined,
    icon: Palette,
    gradientDirection: 'bg-gradient-to-br'
  }
}

// Quick-action pills below the Themes row — not FocusableCards (there's no
// artwork to show), just simple focusable pills like Home's top nav.
type ActionId = 'openThemesFolder' | 'rescanThemesFolder'
const ACTIONS: Array<{ id: ActionId; label: string; icon: typeof FolderOpen }> = [
  { id: 'openThemesFolder', label: 'Open Themes Folder', icon: FolderOpen },
  { id: 'rescanThemesFolder', label: 'Rescan Themes Folder', icon: RefreshCw }
]

type View = 'hub' | 'steamStore'
type HubRow = 'steam' | 'themes' | 'community' | 'actions'
const HUB_ROWS: HubRow[] = ['steam', 'themes', 'community', 'actions']

/**
 * The mockup's "Store" nav item, rebuilt as its own real page instead of
 * dropping straight into the Steam storefront — a single hub (like Home)
 * with a Steam Store card and a Themes shelf for browsing/applying
 * installed themes, since there's no actual online theme marketplace to
 * pull from; "discover" here means "everything already on this machine,
 * shown properly" rather than a fake storefront for content that doesn't
 * exist. The Steam webview itself is unchanged from before — same
 * virtual-cursor-over-a-webview technique — just moved a level deeper,
 * reached by picking the Steam Store card instead of being the only thing
 * this screen ever shows.
 */
export function StoreScreen(): JSX.Element {
  const goHome = useNavigationStore((s) => s.goHome)
  const message = useStatusStore((s) => s.message)
  const setMessage = useStatusStore((s) => s.setMessage)
  const allThemes = useThemeStore((s) => s.allThemes)
  const themeId = useThemeStore((s) => s.themeId)
  const setTheme = useThemeStore((s) => s.setTheme)
  const refreshCustomThemes = useThemeStore((s) => s.refreshCustomThemes)

  const [view, setView] = useState<View>('hub')
  const [rowIndex, setRowIndex] = useState(0)
  const [colIndex, setColIndex] = useState(0)
  const [communityThemes, setCommunityThemes] = useState<CommunityThemeSummary[]>([])
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])

  const webviewRef = useRef<WebviewTag | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const cursorPosRef = useRef({ x: 400, y: 300 })

  useEffect(() => {
    void refreshCustomThemes()
    window.api.settings.listCommunityThemes().then(setCommunityThemes).catch(() => setCommunityThemes([]))
  }, [])

  const themeCards = allThemes.map((theme) => themeToCardItem(theme, themeId))
  const communityThemeCards = communityThemes.map(communityThemeToCardItem)

  const rowLength = (row: HubRow): number => {
    if (row === 'steam') return 1
    if (row === 'themes') return themeCards.length
    if (row === 'community') return communityThemeCards.length
    return ACTIONS.length
  }
  const clampedRowIndex = Math.min(rowIndex, HUB_ROWS.length - 1)
  const activeRow = HUB_ROWS[clampedRowIndex]
  const clampedColIndex = Math.min(colIndex, Math.max(0, rowLength(activeRow) - 1))

  useEffect(() => {
    if (view !== 'hub') return
    rowRefs.current[clampedRowIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [view, clampedRowIndex])

  useEffect(() => {
    if (view !== 'steamStore') return
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    cursorPosRef.current = { x: rect.width / 2, y: rect.height / 2 }
    if (cursorRef.current) {
      cursorRef.current.style.transform = cursorTransform(rect.width / 2, rect.height / 2)
    }
  }, [view])

  // Same reasoning as BrowseScreen: never call webview.focus() — the Gamepad
  // API only delivers to whichever document has focus, and this app's own
  // controller nav (including the Back action that gets you out of here)
  // lives in the host document, not the guest page.
  useEffect(() => {
    if (view !== 'steamStore') return
    let rafId: number
    let baselineX: number | null = null
    let baselineY: number | null = null

    const tick = (): void => {
      const pad = navigator.getGamepads().find((p) => p !== null)
      if (pad) {
        const rawX = pad.axes[2] ?? 0
        const rawY = pad.axes[3] ?? 0
        if (baselineX === null || baselineY === null) {
          baselineX = rawX
          baselineY = rawY
        }
        const stickX = rawX - baselineX
        const stickY = rawY - baselineY
        const magnitude = Math.max(Math.abs(stickX), Math.abs(stickY))
        if (magnitude > CURSOR_DEADZONE) {
          const rect = viewportRef.current?.getBoundingClientRect()
          const maxX = rect?.width ?? 1280
          const maxY = rect?.height ?? 720
          const next = {
            x: Math.max(0, Math.min(maxX, cursorPosRef.current.x + stickX * CURSOR_SPEED)),
            y: Math.max(0, Math.min(maxY, cursorPosRef.current.y + stickY * CURSOR_SPEED))
          }
          cursorPosRef.current = next
          if (cursorRef.current) cursorRef.current.style.transform = cursorTransform(next.x, next.y)
          void webviewRef.current?.sendInputEvent({ type: 'mouseMove', x: next.x, y: next.y })
        }
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [view])

  function click(): void {
    const { x, y } = cursorPosRef.current
    const wv = webviewRef.current
    if (!wv) return
    void wv.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
    void wv.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
  }

  function scroll(dx: number, dy: number): void {
    void webviewRef.current?.executeJavaScript(`window.scrollBy(${dx}, ${dy})`)
  }

  async function doInstallCommunityTheme(summary: CommunityThemeSummary): Promise<void> {
    setMessage(`Installing ${summary.name}...`)
    try {
      const result = await window.api.settings.installCommunityTheme(summary.folder)
      if (result.success && result.theme) {
        await refreshCustomThemes()
        setTheme(result.theme.id)
        setMessage(`Installed and applied ${result.theme.name}`)
      } else {
        setMessage(`Couldn't install ${summary.name}: ${result.error}`)
      }
    } catch (error) {
      setMessage(`Couldn't install ${summary.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function activateHubItem(row: HubRow, index: number): void {
    if (row === 'steam') {
      setView('steamStore')
      return
    }
    if (row === 'themes') {
      const theme = allThemes[index]
      if (theme) {
        setTheme(theme.id)
        setMessage(`Theme set to ${theme.name}`)
      }
      return
    }
    if (row === 'community') {
      const summary = communityThemes[index]
      if (summary) void doInstallCommunityTheme(summary)
      return
    }
    const action = ACTIONS[index]
    if (!action) return
    if (action.id === 'openThemesFolder') openThemesFolder()
    else void rescanThemesFolder(refreshCustomThemes, setMessage)
  }

  useNavListener((action) => {
    if (view === 'steamStore') {
      switch (action) {
        case 'up':
          scroll(0, -SCROLL_STEP)
          return
        case 'down':
          scroll(0, SCROLL_STEP)
          return
        case 'left':
          scroll(-SCROLL_STEP, 0)
          return
        case 'right':
          scroll(SCROLL_STEP, 0)
          return
        case 'confirm':
          click()
          return
        case 'prevStream':
          webviewRef.current?.goBack()
          return
        case 'nextStream':
          webviewRef.current?.goForward()
          return
        case 'toggleSubtitles':
          void webviewRef.current?.loadURL(STORE_URL)
          return
        case 'back':
        case 'menu':
          setView('hub')
          return
        default:
          return
      }
    }

    // view === 'hub'
    switch (action) {
      case 'up':
        setRowIndex((i) => Math.max(0, i - 1))
        setColIndex(0)
        return
      case 'down':
        setRowIndex((i) => Math.min(HUB_ROWS.length - 1, i + 1))
        setColIndex(0)
        return
      case 'left':
        setColIndex((i) => Math.max(0, i - 1))
        return
      case 'right':
        setColIndex((i) => Math.min(rowLength(activeRow) - 1, i + 1))
        return
      case 'confirm':
        activateHubItem(activeRow, clampedColIndex)
        return
      case 'back':
      case 'menu':
        goHome()
        return
      default:
        return
    }
  }, 'store')

  if (view === 'steamStore') {
    return (
      <div className="flex h-screen flex-col bg-bg">
        <header className="flex items-center justify-between border-b border-white/5 px-10 py-5">
          <h1 className="text-2xl font-bold tracking-tight">Steam Store</h1>
          <span className="text-xs text-muted">Back/Forward: L1/R1 · Square: Home · Confirm: Click</span>
        </header>
        <div ref={viewportRef} className="relative flex-1">
          {/* eslint-disable-next-line react/no-unknown-property */}
          <webview ref={webviewRef} src={STORE_URL} allowpopups className="h-full w-full" />
          <div
            ref={cursorRef}
            className="pointer-events-none absolute left-0 top-0 z-20 h-6 w-6 rounded-full border-2 border-white bg-accent/40 shadow-focus"
            style={{ transform: cursorTransform(cursorPosRef.current.x, cursorPosRef.current.y) }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col gap-6 bg-bg px-10 py-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Store</h1>
        <p className="text-sm text-muted">Buy games, and browse or apply the themes on this machine.</p>
      </header>

      <div className="flex flex-1 flex-col gap-8 overflow-y-auto p-5">
        <div ref={(el) => (rowRefs.current[0] = el)} className="w-96">
          <FocusableCard
            item={{
              id: 'steam-store',
              title: 'Steam Store',
              subtitle: 'Browse and buy games',
              icon: ShoppingCart,
              iconColors: ['rgb(91 140 255)', 'rgb(160 107 255)']
            }}
            size="large"
            focused={view === 'hub' && clampedRowIndex === 0}
            onClick={() => activateHubItem('steam', 0)}
          />
        </div>

        <div ref={(el) => (rowRefs.current[1] = el)}>
          <CategoryRow
            label="My Themes"
            items={themeCards}
            focused={clampedRowIndex === 1}
            focusedIndex={clampedRowIndex === 1 ? clampedColIndex : 0}
            aspect="landscape"
            onSelect={(index) => {
              setRowIndex(1)
              setColIndex(index)
              activateHubItem('themes', index)
            }}
          />
        </div>

        <div ref={(el) => (rowRefs.current[2] = el)} className="flex flex-col gap-3">
          <CategoryRow
            label="Community Themes"
            items={communityThemeCards}
            focused={clampedRowIndex === 2}
            focusedIndex={clampedRowIndex === 2 ? clampedColIndex : 0}
            aspect="landscape"
            onSelect={(index) => {
              setRowIndex(2)
              setColIndex(index)
              activateHubItem('community', index)
            }}
          />
          <p className="px-1 text-xs text-muted">
            Submitted by other players via github.com/{COMMUNITY_THEMES_REPO.owner}/
            {COMMUNITY_THEMES_REPO.name} — share your own from Settings' Appearance tab.
          </p>
        </div>

        <div ref={(el) => (rowRefs.current[3] = el)} className="flex gap-3">
          {ACTIONS.map((a, i) => (
            <div
              key={a.id}
              onClick={() => {
                setRowIndex(3)
                setColIndex(i)
                activateHubItem('actions', i)
              }}
              className={`flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium ring-1 transition-colors ${
                clampedRowIndex === 3 && clampedColIndex === i
                  ? 'bg-surface-hi shadow-focus ring-2 ring-accent'
                  : 'bg-surface text-muted ring-accent/15'
              }`}
            >
              <a.icon className="h-4 w-4" />
              {a.label}
            </div>
          ))}
        </div>
      </div>

      <footer className="text-sm text-muted">{message}</footer>
    </div>
  )
}
