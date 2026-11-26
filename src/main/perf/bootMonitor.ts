import { appendLog } from '../logging/service'

// TEMPORARY diagnostic for the cold-boot "laggy until I visit another page"
// report. The renderer-side longtask observer in HomeMenu can only see the
// renderer's own thread -- but in Electron the main process's JS runs on the
// browser UI thread, the one that forwards input to the page and presents
// its frames. Anything synchronous here (sync fs reads, execFileSync, big
// JSON parses) freezes the whole window without ever showing up as a
// renderer long task, which is why the previous rounds of renderer-only
// measurement kept pointing in different directions.
//
// Samples every TICK_MS; any tick that lands more than BLOCK_THRESHOLD_MS
// late means the main thread was blocked for that long. Writes one summary
// line to nexus.log once the window closes -- read it back after a cold boot
// alongside Home's own "[perf] Home FIRST mount" line, then remove both.

const TICK_MS = 20
const BLOCK_THRESHOLD_MS = 50
const WINDOW_MS = 20_000

export function startBootMonitor(): void {
  const startedAt = Date.now()
  const blocks: string[] = []
  let expected = startedAt + TICK_MS
  let worst = 0

  const interval = setInterval(() => {
    const now = Date.now()
    const lag = now - expected
    if (lag > BLOCK_THRESHOLD_MS) {
      blocks.push(`${expected - startedAt}ms+${lag}ms`)
      worst = Math.max(worst, lag)
    }
    expected = now + TICK_MS

    if (now - startedAt >= WINDOW_MS) {
      clearInterval(interval)
      const summary = blocks.length > 0 ? blocks.join(', ') : '(none)'
      appendLog('info', `[perf] main-process blocks in first ${WINDOW_MS / 1000}s (worst ${worst}ms): ${summary}`)
    }
  }, TICK_MS)
}

/** Timestamps a boot phase relative to process start, same log line style. */
export function markBoot(label: string): void {
  appendLog('info', `[perf] boot ${label} at ${Math.round(process.uptime() * 1000)}ms`)
}
