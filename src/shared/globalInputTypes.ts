export interface GlobalInputStatus {
  helperRunning: boolean
  /** null until the first XInputGetState call reports either way. */
  controllerConnected: boolean | null
  mouseModeActive: boolean
  lastError: string | null
  /** How many times the helper process has exited and been auto-restarted
   * this session — 0 in normal operation. A rising count means it's
   * genuinely crashing/dying repeatedly, worth surfacing rather than
   * silently swallowing via the auto-restart. */
  restartCount: number
}
