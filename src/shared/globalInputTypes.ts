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
  /** True once any raw-HID PS/Home-button read thread has successfully read
   * at least one real input report — confirms the button-press capture is
   * actually live, not just that enumeration found a device path. */
  hidPsButtonCaptureLive: boolean
  /** Most recent HID diagnostic line (e.g. "found 0 Sony HID path(s)",
   * "open failed for a Sony HID path, err=32") — this whole subsystem is
   * best-effort raw HID access with no Microsoft-documented API behind it,
   * so surfacing exactly what happened matters more here than anywhere
   * else in this app. */
  hidPsButtonDiagnostic: string | null
}
