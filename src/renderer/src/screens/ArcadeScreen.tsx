import { usePluginLaunch } from '../plugins/usePluginLaunch'
import { useNavigationStore } from '../state/navigationStore'

const ARCADE_PLUGIN_ID = 'arcade'

/**
 * Arcade is the one plugin with a dedicated top-level screen instead of
 * living as a card inside Apps/Games — see main/plugins/trustedPlugins.ts:
 * it's the only plugin id ever granted the trusted preload/bridge (process
 * spawn, registry, filesystem), and a library meant to eventually span a
 * dozen-plus emulator systems doesn't fit as a handful of extra grid cards
 * the way Nexus Dash does. Otherwise this is structurally the same as
 * PluginHost.tsx — same usePluginLaunch hook, same loading/error/ready
 * states — just mounted full-screen from Home instead of as an overlay
 * opened from within another screen.
 */
export function ArcadeScreen(): JSX.Element {
  const goHome = useNavigationStore((s) => s.goHome)
  const { state, webviewRef } = usePluginLaunch(ARCADE_PLUGIN_ID, 'Arcade', goHome)

  if (state.kind === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <p className="text-muted">Starting Arcade...</p>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-bg text-center">
        <p className="text-lg font-semibold">Couldn't start Arcade</p>
        <p className="max-w-md text-sm text-muted">{state.message}</p>
        <div
          onClick={goHome}
          className="cursor-pointer rounded-control bg-accent-gradient px-6 py-3 font-semibold text-white shadow-focus"
        >
          Back
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-black">
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
