import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedAlias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin()],
    build: {
      // Three separate preloads on purpose: index.ts is the main window's own
      // privileged bridge (window.api, everything this app can do). plugin.ts
      // is a second, deliberately tiny one for the <webview> a plugin runs
      // inside (see renderer/src/plugins/PluginHost.tsx) — it exposes only a
      // narrow postMessage-style relay, nothing else, so a plugin's own code
      // has no path to window.api no matter what it tries. arcadePlugin.ts is
      // a third, only ever attached to the one plugin id on the hardcoded
      // trust allow-list (see main/plugins/trustedPlugins.ts) — a materially
      // larger bridge (process spawn, registry, filesystem), never handed to
      // any other plugin regardless of what its manifest claims.
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          plugin: resolve('src/preload/plugin.ts'),
          arcadePlugin: resolve('src/preload/arcadePlugin.ts')
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        ...sharedAlias
      }
    },
    plugins: [react()]
  }
})
