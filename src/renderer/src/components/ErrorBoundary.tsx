import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useNavListener } from '../input/useNavListener'
import { useNavigationStore } from '../state/navigationStore'

interface FallbackProps {
  message: string
  onReset: () => void
}

function ErrorFallback({ message, onReset }: FallbackProps): JSX.Element {
  // No screenId guard — this has to work regardless of whatever the current
  // screen happens to be, since that's exactly the state that just crashed.
  useNavListener((action) => {
    if (action === 'confirm' || action === 'back' || action === 'menu') onReset()
  })

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-bg px-10 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted">{message}</p>
      <p className="text-sm text-muted">Press Confirm or Back to return home</p>
    </div>
  )
}

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * This app has no other safety net: without this, an uncaught exception
 * anywhere in a screen's render or effects unmounts the entire React tree —
 * a genuinely blank page with every input listener gone, recoverable only by
 * restarting the app. Wrapping just the per-screen content (not the gamepad/
 * keyboard hooks mounted above it in App) means those keep running, so this
 * fallback's own useNavListener call still receives input to get back out.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <ErrorFallback
          message={this.state.error.message}
          onReset={() => {
            this.setState({ error: null })
            useNavigationStore.getState().goHome()
          }}
        />
      )
    }
    return this.props.children
  }
}
