import { execFileSync, spawn } from 'child_process'
import { dialog, ipcMain, session, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { runGameSession, waitForChildExit } from '../gameSession/service'

const ARCADE_PARTITION = 'persist:plugin-arcade'

/**
 * Every channel here is only ever reachable in practice by Arcade's own
 * <webview> — arcadePlugin.ts's preload (the only thing that ever calls
 * these channels) is only ever attached when trustedPlugins.ts says so —
 * but ipcMain channels are process-global, so this re-checks the sender's
 * own session identity on every single call as real defense in depth, not
 * decoration. session.fromPartition returns the same cached Session object
 * for a given partition string for the app's whole lifetime, so this is a
 * genuine identity check, not a string comparison a spoofed sender could
 * fake.
 */
function assertArcadeSender(event: IpcMainInvokeEvent): void {
  if (event.sender.session !== session.fromPartition(ARCADE_PARTITION)) {
    throw new Error('Not authorized')
  }
}

/** Backs preload/arcadePlugin.ts — see that file and
 * main/plugins/trustedPlugins.ts for what this is and why it exists.
 * Deliberately low-level primitives, not per-emulator operations: Arcade's
 * own downloaded bundle composes these into adapters itself, so a new
 * emulator's support never needs a core Nexus change (see the Arcade
 * Phase 1 plan for why that trade-off was made deliberately, eyes open). */
export function registerArcadeTrustedIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    'arcade:spawnProcess',
    (event, path: string, args: string[]): Promise<{ error: string | null }> => {
      assertArcadeSender(event)
      return new Promise((resolve) => {
        try {
          const child = spawn(path, args, { detached: true, stdio: 'ignore' })
          let settled = false
          child.once('error', (error) => {
            if (settled) return
            settled = true
            resolve({ error: error.message })
          })
          // Same "probably started fine" heuristic as apps/service.ts's
          // launchApp — detached processes don't reliably emit 'spawn'.
          setTimeout(() => {
            if (settled) return
            settled = true
            // Same "hide Nexus, wait for exit, restore" flow every other
            // launch path in this app already uses (apps/ipc.ts, steam/ipc.ts)
            // — not awaited, so this resolves as soon as the launch itself
            // looks OK rather than blocking on the whole play session.
            void runGameSession(mainWindow, waitForChildExit(child))
            resolve({ error: null })
          }, 250)
          child.unref()
        } catch (error) {
          resolve({ error: error instanceof Error ? error.message : String(error) })
        }
      })
    }
  )

  ipcMain.handle('arcade:queryRegistry', (event, hive: 'HKCU' | 'HKLM', keyPath: string): string | null => {
    assertArcadeSender(event)
    try {
      return execFileSync('reg', ['query', `${hive}\\${keyPath}`]).toString('utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle('arcade:pickFolder', async (event): Promise<string | null> => {
    assertArcadeSender(event)
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('arcade:listDir', (event, path: string): string[] => {
    assertArcadeSender(event)
    return readdirSync(path)
  })

  ipcMain.handle('arcade:readFile', (event, path: string): string => {
    assertArcadeSender(event)
    return readFileSync(path, 'utf-8')
  })

  ipcMain.handle('arcade:writeFile', (event, path: string, content: string): void => {
    assertArcadeSender(event)
    writeFileSync(path, content, 'utf-8')
  })
}
