import { execFile } from 'child_process'
import os from 'os'
import type { SystemStats } from '@shared/systemTypes'

// Official Win32 virtual-key codes for the hardware media keys — keybd_event
// synthesizes a real system-wide key press/release, so this changes the OS
// master volume regardless of which app has focus, the same as an actual
// keyboard's volume keys. No bundled binary (nircmd etc.) and no native
// Node module: user32.dll and powershell.exe both already ship with Windows.
const VK_VOLUME_MUTE = 0xad
const VK_VOLUME_DOWN = 0xae
const VK_VOLUME_UP = 0xaf

function sendMediaKey(virtualKeyCode: number): void {
  const script = [
    'Add-Type -TypeDefinition \'',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class ClashPointVolume {',
    '  [DllImport("user32.dll")]',
    '  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);',
    '}',
    "'",
    `[ClashPointVolume]::keybd_event(${virtualKeyCode}, 0, 0, [UIntPtr]::Zero)`,
    `[ClashPointVolume]::keybd_event(${virtualKeyCode}, 0, 2, [UIntPtr]::Zero)`
  ].join('\n')
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
}

export function volumeUp(): void {
  sendMediaKey(VK_VOLUME_UP)
}

export function volumeDown(): void {
  sendMediaKey(VK_VOLUME_DOWN)
}

export function toggleMute(): void {
  sendMediaKey(VK_VOLUME_MUTE)
}

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
