import { useEffect } from 'react'
import { useCrashLogStore } from '../state/crashLogStore'

const AUTO_DISMISS_MS = 20000

/**
 * Surfaces whatever navBus/main.tsx's global handlers just caught — those
 * only console.error today, which is invisible in a packaged build with no
 * DevTools open. Deliberately has no nav-bus wiring of its own (no dismiss-
 * via-controller) so it can't itself become another moving part in a system
 * that's actively being debugged for nav-related crashes — mouse/touch or
 * auto-dismiss only.
 */
export function CrashToast(): JSX.Element | null {
  const lastError = useCrashLogStore((s) => s.lastError)
  const clear = useCrashLogStore((s) => s.clear)

  useEffect(() => {
    if (!lastError) return
    const timer = setTimeout(clear, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [lastError, clear])

  if (!lastError) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4">
      <div className="flex max-w-2xl items-start gap-3 rounded-xl bg-red-950/95 px-5 py-4 text-sm text-red-100 shadow-panel ring-1 ring-red-500/40">
        <span className="mt-0.5 shrink-0">⚠️</span>
        <pre className="max-h-40 flex-1 overflow-y-auto whitespace-pre-wrap break-words font-sans">
          {lastError}
        </pre>
        <button
          onClick={clear}
          className="shrink-0 rounded-lg bg-red-900 px-3 py-1 text-xs font-semibold text-red-100 hover:bg-red-800"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
