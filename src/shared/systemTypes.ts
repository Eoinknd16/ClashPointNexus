export interface SystemStats {
  totalMemGb: number
  freeMemGb: number
  usedMemPercent: number
  uptimeHours: number
  /** null on the rare platform where the two-sample CPU read comes back with
   * no measurable delta (e.g. a single-core VM under heavy scheduler jitter). */
  cpuLoadPercent: number | null
}
