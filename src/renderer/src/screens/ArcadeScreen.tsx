import { CloseButton } from '../components/NavButtons'
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
    <div className="relative h-screen w-screen bg-black">
      {/* eslint-disable-next-line react/no-unknown-property */}
      <webview
        ref={webviewRef}
        src={state.indexUrl}
        preload={state.preloadPath}
        partition={state.partition}
        className="h-full w-full"
      />
      {/* A plugin fully owns nav input once it's running — mouse-only
          input (no controller attached) had no way to trigger a 'back'
          at all otherwise. Relayed as a real nav action, not a hard
          exit, so Arcade's own back-out-of-the-game-list-first behavior
          still works the same from a click as it does from a controller. */}
      <CloseButton
        className="absolute left-4 top-4 z-10"
        onClick={() => webviewRef.current?.send('cpx-to-guest', { type: 'nav', action: 'back' })}
      />
    </div>
  )
}
