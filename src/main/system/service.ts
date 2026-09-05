import os from 'os'
import type { SystemStats } from '@shared/systemTypes'

function cpuTimes(): { idle: number; total: number } {
  let idle = 0
  let total = 0
  for (const cpu of os.cpus()) {
    for (const time of Object.values(cpu.times)) total += time
    idle += cpu.times.idle
  }
  return { idle, total }
}

/** os.loadavg() is always [0,0,0] on Windows, so CPU usage is measured
 * directly instead: two snapshots of per-core tick counters 200ms apart,
 * the same technique Task Manager's own percentage is derived from. */
export async function getSystemStats(): Promise<SystemStats> {
  const start = cpuTimes()
  await new Promise((resolve) => setTimeout(resolve, 200))
  const end = cpuTimes()

  const idleDelta = end.idle - start.idle
  const totalDelta = end.total - start.total
  const cpuLoadPercent = totalDelta > 0 ? Math.round(100 * (1 - idleDelta / totalDelta)) : null

  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const gb = 1024 ** 3

  return {
    totalMemGb: totalMem / gb,
    freeMemGb: freeMem / gb,
    usedMemPercent: Math.round(100 * (1 - freeMem / totalMem)),
    uptimeHours: os.uptime() / 3600,
    cpuLoadPercent
  }
}
