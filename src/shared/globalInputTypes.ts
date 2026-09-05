export interface GlobalInputStatus {
  helperRunning: boolean
  /** null until the first XInputGetState call reports either way. */
  controllerConnected: boolean | null
  mouseModeActive: boolean
  lastError: string | null
}
