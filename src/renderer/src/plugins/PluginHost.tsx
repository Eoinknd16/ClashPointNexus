import { usePluginLaunch } from './usePluginLaunch'

interface Props {
  pluginId: string
  pluginName: string
  onClose: () => void
}

/**
 * Mounts an ordinary installed plugin as a full-screen overlay from
 * wherever it was opened (Apps/Games/Settings) — the sandboxed <webview>
 * itself, and everything that makes launching one safe, lives in
 * usePluginLaunch.ts (shared with ArcadeScreen.tsx, the one trusted plugin
 * that instead gets its own dedicated top-level screen rather than an
 * overlay). What makes it safe: main/plugins/session.ts's locked-down,
 * deny-by-default session; preload/plugin.ts's narrow two-function bridge
 * (no window.api, no Node); main/plugins/pluginShell.ts's fixed CSP;
 * main/plugins/install.ts's SHA-256 re-verification, redone on every
 * launch via prepareLaunch, not just once at install time. This
 * component's own job stays small: mount the <webview> with exactly what
 * the hook returned — nothing here has (or needs) a path to anything
 * privileged.
 */
export function PluginHost({ pluginId, pluginName, onClose }: Props): JSX.Element {
  const { state, webviewRef } = usePluginLaunch(pluginId, pluginName, onClose)

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
