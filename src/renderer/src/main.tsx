import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useCrashLogStore } from './state/crashLogStore'
import './styles/index.css'

// Can't recover a React tree from here, since these fire for errors React
// never even saw (a rejected promise, a throw inside framer-motion's own
// rAF-driven animation loop) — the ErrorBoundary below is what actually
// prevents the blank-page failure mode. But console.error is invisible in a
// packaged build with no DevTools open, so these also surface on the
// CrashToast banner — the only way to see what actually crashed without a
// dev console.
window.addEventListener('error', (event) => {
  const message = event.error instanceof Error ? event.error.message : String(event.error ?? event.message)
  // eslint-disable-next-line no-console
  console.error('[global] uncaught error:', event.error ?? event.message)
  useCrashLogStore.getState().reportError(`Uncaught error: ${message}`)
})
window.addEventListener('unhandledrejection', (event) => {
  const message = event.reason instanceof Error ? event.reason.message : String(event.reason)
  // eslint-disable-next-line no-console
  console.error('[global] unhandled rejection:', event.reason)
  useCrashLogStore.getState().reportError(`Unhandled promise rejection: ${message}`)
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {/* Wraps App itself, not just the per-screen content App renders — a
        crash in App's own hooks (gamepad/keyboard/theme init) would otherwise
        unmount everything with nothing above it to catch it, which is a
        blank #root indistinguishable from what's been reported. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
