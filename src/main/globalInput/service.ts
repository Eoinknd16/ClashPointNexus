import { type ChildProcessWithoutNullStreams, spawn } from 'child_process'
import type { GlobalInputStatus } from '@shared/globalInputTypes'
import { GLOBAL_INPUT_HELPER_SCRIPT } from './helperScript'

const RESTART_DELAY_MS = 3000

let helperProcess: ChildProcessWithoutNullStreams | null = null
let mouseModeActive = false
let helperRunning = false
let controllerConnected: boolean | null = null
let lastError: string | null = null
let stopped = false
let stdoutBuffer = ''
let stderrBuffer = ''

let onQuickMenuCombo: (() => void) | null = null
let onMouseModeChange: ((active: boolean) => void) | null = null
let onStatusChange: ((status: GlobalInputStatus) => void) | null = null

export function setQuickMenuComboHandler(handler: (() => void) | null): void {
  onQuickMenuCombo = handler
}

export function setMouseModeChangeHandler(handler: ((active: boolean) => void) | null): void {
  onMouseModeChange = handler
}

export function setStatusChangeHandler(handler: ((status: GlobalInputStatus) => void) | null): void {
  onStatusChange = handler
}

export function isMouseModeActive(): boolean {
  return mouseModeActive
}

export function getGlobalInputStatus(): GlobalInputStatus {
  return { helperRunning, controllerConnected, mouseModeActive, lastError }
}

function notifyStatus(): void {
  onStatusChange?.(getGlobalInputStatus())
}

function handleLine(line: string): void {
  if (line === 'HELPER_STARTED') {
    helperRunning = true
    notifyStatus()
  } else if (line === 'CONTROLLER_CONNECTED') {
    controllerConnected = true
    notifyStatus()
  } else if (line === 'CONTROLLER_DISCONNECTED') {
    controllerConnected = false
    notifyStatus()
  } else if (line === 'COMBO_QUICKMENU') {
    onQuickMenuCombo?.()
  } else if (line === 'MOUSE_MODE_ON') {
    mouseModeActive = true
    onMouseModeChange?.(true)
    notifyStatus()
  } else if (line === 'MOUSE_MODE_OFF') {
    mouseModeActive = false
    onMouseModeChange?.(false)
    notifyStatus()
  }
}

/** Started once at app launch, runs for the app's whole lifetime — this is
 * what makes the Quick Menu combo and Mouse Mode work regardless of which
 * window currently has focus, unlike the Gamepad-API-based nav the rest of
 * the app runs on. Auto-restarts if the helper process ever dies, so a one-
 * off PowerShell hiccup doesn't permanently disable global input for the
 * rest of the session. */
export function startGlobalInputWatcher(): void {
  if (helperProcess || stopped) return

  const proc = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', GLOBAL_INPUT_HELPER_SCRIPT],
    { windowsHide: true }
  )
  helperProcess = proc

  proc.stdout.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString('utf-8')
    let newlineIndex: number
    while ((newlineIndex = stdoutBuffer.indexOf('\n')) >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim()
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
      if (line) handleLine(line)
    }
  })

  proc.stderr.on('data', (chunk: Buffer) => {
    stderrBuffer += chunk.toString('utf-8')
  })

  proc.on('exit', () => {
    if (helperProcess === proc) helperProcess = null
    helperRunning = false
    mouseModeActive = false
    controllerConnected = null
    if (stderrBuffer.trim()) lastError = stderrBuffer.trim().slice(-500)
    stderrBuffer = ''
    notifyStatus()
    if (!stopped) setTimeout(startGlobalInputWatcher, RESTART_DELAY_MS)
  })

  proc.on('error', (error) => {
    if (helperProcess === proc) helperProcess = null
    helperRunning = false
    lastError = error.message
    notifyStatus()
  })
}

export function stopGlobalInputWatcher(): void {
  stopped = true
  helperProcess?.kill()
  helperProcess = null
  helperRunning = false
}

/** Mirrors the physical L1+R1+Back combo — same toggle, reachable from the
 * in-app Quick Menu instead of only by holding the controller combo. */
export function toggleMouseModeFromApp(): void {
  helperProcess?.stdin.write('TOGGLE_MOUSE\n')
}
