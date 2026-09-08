import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { WebviewTag } from 'electron'
import { useExclusiveNavListener } from '../input/useNavListener'
import { useStatusStore } from '../state/statusStore'

export type PluginLaunchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; indexUrl: string; preloadPath: string; partition: string }

/**
 * Everything about actually launching a plugin's <webview> and relaying
 * nav/exit/crash — shared by PluginHost.tsx (every ordinary plugin, mounted
 * as an overlay from within Apps/Games/Settings) and ArcadeScreen.tsx (the
 * one trusted plugin, mounted as its own full top-level screen). Only where
 * the resulting <webview> gets placed in the page differs, which stays in
 * each caller. See PluginHost.tsx's own doc comment for what makes this
 * safe — everything named there still applies regardless of who's using
 * this hook.
 */
export function usePluginLaunch(
  pluginId: string,
  pluginName: string,
  onClose: () => void
): { state: PluginLaunchState; webviewRef: MutableRefObject<WebviewTag | null> } {
  const setMessage = useStatusStore((s) => s.setMessage)
  const [state, setState] = useState<PluginLaunchState>({ kind: 'loading' })
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

    // The guest's only way to talk back — see preload/plugin.ts's (or
    // preload/arcadePlugin.ts's) sendToHost, the only thing it can call.
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
    // into the sandboxed guest via the one bridge it has.
    webviewRef.current?.send('cpx-to-guest', { type: 'nav', action })
  }, state.kind === 'ready')

  return { state, webviewRef }
}
