import { useEffect, useRef, useState } from 'react'
import type { WebviewTag } from 'electron'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { KEY_ROWS, applyKey, clampKeyboardFocus } from '../components/onScreenKeyboardLayout'
import { useNavListener } from '../input/useNavListener'
import { useNavigationStore } from '../state/navigationStore'

type BrowseZone = 'address' | 'page' | 'keyboard'
const TOOLBAR_ITEMS = ['back', 'forward', 'reload', 'home', 'address'] as const
type ToolbarItem = (typeof TOOLBAR_ITEMS)[number]

const HOME_URL = 'https://www.google.com'
const SCROLL_STEP = 160
const CURSOR_SPEED = 16
const CURSOR_DEADZONE = 0.15
const CURSOR_RADIUS = 12

const TOOLBAR_LABELS: Record<Exclude<ToolbarItem, 'address'>, string> = {
  back: '◀',
  forward: '▶',
  reload: '⟳',
  home: '⌂'
}

/** Anything without a space that contains a dot looks like a domain; everything
 * else is treated as a search query — the same heuristic every real browser uses. */
function resolveUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return HOME_URL
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
  if (!trimmed.includes(' ') && trimmed.includes('.')) return `https://${trimmed}`
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}

function cursorTransform(x: number, y: number): string {
  return `translate(${x - CURSOR_RADIUS}px, ${y - CURSOR_RADIUS}px)`
}

/**
 * Controller-driven browsing via a virtual mouse cursor (right stick moves it,
 * Confirm clicks) rather than spatial link-navigation — works on any site with
 * zero per-page logic, since it's just synthetic mouse events into the
 * <webview>, the same technique console browsers use. Real mouse/keyboard work
 * on the <webview> natively without any of this — it's an ordinary web view.
 */
export function BrowseScreen(): JSX.Element {
  const goHome = useNavigationStore((s) => s.goHome)
  const [zone, setZone] = useState<BrowseZone>('address')
  const [toolbarIndex, setToolbarIndex] = useState(TOOLBAR_ITEMS.length - 1)
  const [url, setUrl] = useState(HOME_URL)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [kbRow, setKbRow] = useState(0)
  const [kbCol, setKbCol] = useState(0)
  const [kbValue, setKbValue] = useState('')
  const [kbShift, setKbShift] = useState(false)

  const webviewRef = useRef<WebviewTag | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const cursorPosRef = useRef({ x: 400, y: 300 })

  // Center the cursor over the actual viewport once we know its real size,
  // rather than guessing a fixed default that's wrong on most window sizes.
  useEffect(() => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    cursorPosRef.current = { x: rect.width / 2, y: rect.height / 2 }
    if (cursorRef.current) {
      cursorRef.current.style.transform = cursorTransform(rect.width / 2, rect.height / 2)
    }
  }, [])

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return
    const handleNavigate = (): void => {
      setUrl(wv.getURL())
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
    }
    wv.addEventListener('did-navigate', handleNavigate)
    wv.addEventListener('did-navigate-in-page', handleNavigate)
    return () => {
      wv.removeEventListener('did-navigate', handleNavigate)
      wv.removeEventListener('did-navigate-in-page', handleNavigate)
    }
  }, [])

  // Right stick moves the virtual cursor and drives synthetic mouse events
  // into the webview — only while actually interacting with the page, not
  // while the toolbar is focused. Deliberately never calls webview.focus():
  // the Gamepad API only delivers data to whichever document currently has
  // focus, and this app's whole controller nav system (including the Back
  // action that gets you out of this screen) lives in the host document, not
  // the guest page — focusing the webview would cut off controller input
  // app-wide, not just here.
  useEffect(() => {
    if (zone !== 'page') return
    let rafId: number

    const tick = (): void => {
      const pad = navigator.getGamepads().find((p) => p !== null)
      if (pad) {
        const stickX = pad.axes[2] ?? 0
        const stickY = pad.axes[3] ?? 0
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
  }, [zone])

  function openKeyboard(initialValue: string): void {
    setKbValue(initialValue)
    setKbShift(false)
    setKbRow(0)
    setKbCol(0)
    setZone('keyboard')
  }

  function submitKeyboard(finalValue: string): void {
    setZone('address')
    setToolbarIndex(TOOLBAR_ITEMS.length - 1)
    void webviewRef.current?.loadURL(resolveUrl(finalValue))
  }

  function cancelKeyboard(): void {
    setZone('address')
  }

  function pressVirtualKey(key: string): void {
    const result = applyKey(key, kbValue, kbShift)
    setKbValue(result.value)
    setKbShift(result.shift)
    if (result.done) submitKeyboard(result.value)
  }

  function activateToolbar(item: ToolbarItem): void {
    const wv = webviewRef.current
    if (item === 'back') wv?.goBack()
    else if (item === 'forward') wv?.goForward()
    else if (item === 'reload') wv?.reload()
    else if (item === 'home') void wv?.loadURL(HOME_URL)
    else openKeyboard(url)
  }

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

    if (zone === 'page') {
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
          activateToolbar('back')
          return
        case 'nextStream':
          activateToolbar('forward')
          return
        case 'back':
        case 'menu':
          setZone('address')
          return
        default:
          return
      }
    }

    // zone === 'address'
    switch (action) {
      case 'left':
        setToolbarIndex((i) => Math.max(0, i - 1))
        return
      case 'right':
        setToolbarIndex((i) => Math.min(TOOLBAR_ITEMS.length - 1, i + 1))
        return
      case 'down':
        setZone('page')
        return
      case 'confirm':
        activateToolbar(TOOLBAR_ITEMS[toolbarIndex])
        return
      case 'back':
      case 'menu':
        goHome()
        return
      default:
        return
    }
  }, 'browse')

  return (
    <div className="flex h-screen flex-col bg-bg">
      <div className="flex items-center gap-3 border-b border-white/5 bg-surface px-6 py-4">
        {(['back', 'forward', 'reload', 'home'] as const).map((item, i) => (
          <button
            key={item}
            onClick={() => {
              setZone('address')
              setToolbarIndex(i)
              activateToolbar(item)
            }}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg transition-colors ${
              (item === 'back' && !canGoBack) || (item === 'forward' && !canGoForward)
                ? 'opacity-30'
                : ''
            } ${
              zone === 'address' && toolbarIndex === i ? 'bg-accent text-white' : 'bg-surface-hi text-white'
            }`}
          >
            {TOOLBAR_LABELS[item]}
          </button>
        ))}
        <div
          onClick={() => {
            setZone('address')
            setToolbarIndex(TOOLBAR_ITEMS.length - 1)
            openKeyboard(url)
          }}
          className={`flex-1 cursor-pointer truncate rounded-lg bg-surface-hi px-4 py-2 text-sm text-muted transition-colors ${
            zone === 'address' && toolbarIndex === TOOLBAR_ITEMS.length - 1 ? 'ring-2 ring-accent' : ''
          }`}
        >
          {url}
        </div>
      </div>

      <div ref={viewportRef} className="relative flex-1">
        {/* eslint-disable-next-line react/no-unknown-property */}
        <webview ref={webviewRef} src={HOME_URL} allowpopups className="h-full w-full" />
        {zone === 'page' && (
          <div
            ref={cursorRef}
            className="pointer-events-none absolute left-0 top-0 z-20 h-6 w-6 rounded-full border-2 border-white bg-accent/40 shadow-focus"
            style={{ transform: cursorTransform(cursorPosRef.current.x, cursorPosRef.current.y) }}
          />
        )}
      </div>

      {zone === 'keyboard' && (
        <OnScreenKeyboard
          label="Go to address or search"
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
