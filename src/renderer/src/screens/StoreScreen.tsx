import { useEffect, useRef } from 'react'
import type { WebviewTag } from 'electron'
import { useNavListener } from '../input/useNavListener'
import { useNavigationStore } from '../state/navigationStore'

const STORE_URL = 'https://store.steampowered.com'
const SCROLL_STEP = 160
const CURSOR_SPEED = 16
const CURSOR_DEADZONE = 0.15
const CURSOR_RADIUS = 12

function cursorTransform(x: number, y: number): string {
  return `translate(${x - CURSOR_RADIUS}px, ${y - CURSOR_RADIUS}px)`
}

/**
 * The mockup's "Store" nav item — discover/buy new games, distinct from
 * Library ("your stuff") and from Games (your installed/owned Steam
 * library). Reuses BrowseScreen's virtual-cursor-over-a-webview technique
 * (right stick moves it, Confirm clicks) since it works on any site with
 * zero per-page logic, but trimmed down to a single fixed destination with
 * no address bar/toolbar — this is meant to feel like a locked-down store
 * front, not a general browser.
 */
export function StoreScreen(): JSX.Element {
  const goHome = useNavigationStore((s) => s.goHome)
  const webviewRef = useRef<WebviewTag | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const cursorPosRef = useRef({ x: 400, y: 300 })

  useEffect(() => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    cursorPosRef.current = { x: rect.width / 2, y: rect.height / 2 }
    if (cursorRef.current) {
      cursorRef.current.style.transform = cursorTransform(rect.width / 2, rect.height / 2)
    }
  }, [])

  // Same reasoning as BrowseScreen: never call webview.focus() — the Gamepad
  // API only delivers to whichever document has focus, and this app's own
  // controller nav (including the Back action that gets you out of here)
  // lives in the host document, not the guest page.
  useEffect(() => {
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
  }, [])

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
        goHome()
        return
      default:
        return
    }
  }, 'store')

  return (
    <div className="flex h-screen flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-white/5 px-10 py-5">
        <h1 className="text-2xl font-bold tracking-tight">Store</h1>
        <span className="text-xs text-muted">◀ Back/Forward: L1/R1 · Square: Home · Confirm: Click</span>
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
