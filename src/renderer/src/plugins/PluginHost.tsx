import { useEffect, useRef, useState } from 'react'
import type { WebviewTag } from 'electron'
import { useExclusiveNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'

interface Props {
  pluginId: string
  pluginName: string
  onClose: () => void
}

/**
 * Actually runs an installed plugin — the one place in the app that
 * creates the sandboxed <webview> a plugin's own code executes inside.
 * Everything that makes this safe lives elsewhere and is assembled here:
 * main/plugins/session.ts's locked-down, deny-by-default session;
 * preload/plugin.ts's narrow two-function bridge (no window.api, no
 * Node); main/plugins/pluginShell.ts's fixed CSP; main/plugins/install.ts's
 * SHA-256 re-verification, redone on every launch via prepareLaunch, not
 * just once at install time. This component's own job is small by
 * design: request a launch, mount the <webview> with exactly what that
 * returned, and relay nav input in one direction, exit/error out the
 * other — nothing here has (or needs) a path to anything privileged.
 */
export function PluginHost({ pluginId, pluginName, onClose }: Props): JSX.Element {
  const setMessage = useStatusStore((s) => s.setMessage)
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; indexUrl: string; preloadPath: string; partition: string }
  >({ kind: 'loading' })

  const webviewRef = useRef<WebviewTag | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.plugins
      .prepareLaunch(pluginId)
      .then((result) => {
        if (cancelled) return
        if (result.ok) {
          setState({
            kind: 'ready',
            indexUrl: result.info.indexUrl,
            preloadPath: result.info.preloadPath,
            partition: result.info.partition
          })
        } else {
          setState({ kind: 'error', message: result.error })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [pluginId])

  useEffect(() => {
    if (state.kind !== 'ready') return
    const webview = webviewRef.current
    if (!webview) return

    // The guest's only way to talk back — see preload/plugin.ts's
    // sendToHost, which is the only thing it can call at all.
    const handleIpcMessage = (event: Electron.IpcMessageEvent): void => {
      if (event.channel !== 'cpx') return
      const data = event.args[0] as { type?: string; message?: string } | undefined
      if (data?.type === 'exit') {
        onClose()
      } else if (data?.type === 'error') {
        setMessage(`${pluginName}: ${data.message ?? 'plugin error'}`)
        onClose()
      }
    }
    // A guest page crashing outright (not a plugin bug reachable via JS,
    // an actual renderer-process crash) still shouldn't strand the user
    // with no way back to the rest of the app.
    const handleCrashed = (): void => {
      setMessage(`${pluginName} stopped responding`)
      onClose()
    }
    // Documented to be preventable for a <webview>'s own guest-initiated
    // navigation, unlike the main window's webContents — closes off a
    // plugin trying to browse its own sandboxed page somewhere else.
    // CSP (script-src 'self', frame-src/object-src 'none') already closes
    // the higher-severity escalation paths regardless of this.
    const handleWillNavigate = (event: Event): void => event.preventDefault()

    webview.addEventListener('ipc-message', handleIpcMessage)
    webview.addEventListener('crashed', handleCrashed)
    webview.addEventListener('will-navigate', handleWillNavigate)
    return () => {
      webview.removeEventListener('ipc-message', handleIpcMessage)
      webview.removeEventListener('crashed', handleCrashed)
      webview.removeEventListener('will-navigate', handleWillNavigate)
    }
  }, [state.kind, onClose, pluginName, setMessage])

  useExclusiveNavListener((action) => {
    // The plugin owns all input once it's actually running — this just
    // relays the same normalized action every other screen already uses
    // into the sandboxed guest via the one bridge it has (boot.js's own
    // api.onNav, fed by preload/plugin.ts's onHostMessage).
    webviewRef.current?.send('cpx-to-guest', { type: 'nav', action })
  }, state.kind === 'ready')

  if (state.kind === 'loading') {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg">
        <p className="text-muted">Starting {pluginName}...</p>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-bg text-center">
        <p className="text-lg font-semibold">Couldn't start {pluginName}</p>
        <p className="max-w-md text-sm text-muted">{state.message}</p>
        <div
          onClick={onClose}
          className="cursor-pointer rounded-control bg-accent-gradient px-6 py-3 font-semibold text-white shadow-focus"
        >
          Back
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-40 bg-black">
      {/* eslint-disable-next-line react/no-unknown-property */}
      <webview
        ref={webviewRef}
        src={state.indexUrl}
        preload={state.preloadPath}
        partition={state.partition}
        className="h-full w-full"
      />
    </div>
  )
}
