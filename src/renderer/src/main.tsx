import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/index.css'

// Visibility only — can't recover a React tree from here, since these fire for
// errors React never even saw (a rejected promise, a throw inside framer-
// motion's own rAF-driven animation loop). The ErrorBoundary below is what
// actually prevents the blank-page failure mode; this is so a report of it
// happening again comes with a real stack trace in the console instead of
// nothing to go on.
window.addEventListener('error', (event) => {
  // eslint-disable-next-line no-console
  console.error('[global] uncaught error:', event.error ?? event.message)
})
window.addEventListener('unhandledrejection', (event) => {
  // eslint-disable-next-line no-console
  console.error('[global] unhandled rejection:', event.reason)
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
