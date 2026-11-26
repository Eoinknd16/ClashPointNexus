import { app } from 'electron'
import { execFile } from 'child_process'
import { readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import type { WolSetupResult, WolStatus } from '@shared/remoteTypes'
import { appendLog } from '../logging/service'

/**
 * Wake-on-LAN, set up from inside Nexus (Settings > Phone Link).
 *
 * Windows-side, WoL needs: the wired adapter allowed to wake the PC, its
 * "Wake on Magic Packet" driver setting on, and Fast Startup off (a Fast
 * Startup "shutdown" is really hibernation, and most network cards stop
 * listening for magic packets in it). All of that is changed here with one
 * admin prompt. The BIOS/UEFI "Wake on LAN" / "Power on by PCI-E" switch is
 * the one thing software can't flip, so the UI points at it.
 */

function runPowerShell(script: string, timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr?.trim() || error.message))
        else resolve(stdout)
      }
    )
  })
}

const STATUS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$adapters = Get-NetAdapter -Physical | ForEach-Object {
  $pm = Get-NetAdapterPowerManagement -Name $_.Name
  [pscustomobject]@{
    name = $_.Name
    description = $_.InterfaceDescription
    status = [string]$_.Status
    mac = ($_.MacAddress -replace '-', ':')
    wired = ($_.PhysicalMediaType -match '802\\.3') -or ($_.MediaType -eq '802.3' -and $_.PhysicalMediaType -notmatch 'Native 802\\.11|Wireless')
    wakeOnMagicPacket = if ($pm) { [string]$pm.WakeOnMagicPacket } else { $null }
  }
}
$hb = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power' -Name HiberbootEnabled).HiberbootEnabled
[pscustomobject]@{ adapters = @($adapters); hiberboot = $hb } | ConvertTo-Json -Depth 4 -Compress
`

export async function getWolStatus(): Promise<WolStatus> {
  if (process.platform !== 'win32') {
    return { supported: false, adapters: [], fastStartupEnabled: null, ready: false, error: 'Windows only' }
  }
  try {
    const raw = JSON.parse((await runPowerShell(STATUS_SCRIPT)).trim() || '{}')
    const adapters = (Array.isArray(raw.adapters) ? raw.adapters : raw.adapters ? [raw.adapters] : []).map(
      (a: Record<string, unknown>) => ({
        name: String(a.name ?? ''),
        description: String(a.description ?? ''),
        status: String(a.status ?? ''),
        mac: String(a.mac ?? '').toUpperCase(),
        wired: Boolean(a.wired),
        wakeOnMagicPacket: a.wakeOnMagicPacket == null ? null : String(a.wakeOnMagicPacket)
      })
    )
    const fastStartupEnabled = raw.hiberboot == null ? null : Number(raw.hiberboot) === 1
    const wiredUp = adapters.filter((a: WolStatus['adapters'][number]) => a.wired && a.status === 'Up')
    const ready =
      wiredUp.length > 0 && wiredUp.every((a: WolStatus['adapters'][number]) => a.wakeOnMagicPacket === 'Enabled') && fastStartupEnabled === false
    return { supported: true, adapters, fastStartupEnabled, ready, error: null }
  } catch (error) {
    return { supported: true, adapters: [], fastStartupEnabled: null, ready: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Runs elevated. Writes its log as JSON to $Out so the non-elevated side can read it back. */
const SETUP_SCRIPT = `
param([string]$Out)
$ErrorActionPreference = 'Continue'
$log = New-Object System.Collections.Generic.List[string]
function Note($m) { $log.Add($m) | Out-Null }

$adapters = Get-NetAdapter -Physical | Where-Object { $_.PhysicalMediaType -match '802\\.3' -or $_.MediaType -eq '802.3' }
if (-not $adapters) { Note 'No wired network adapter found. Wake-on-LAN needs Ethernet; Wi-Fi cards usually cannot wake a PC that is off.' }

foreach ($a in $adapters) {
  $n = $a.Name
  try {
    Set-NetAdapterPowerManagement -Name $n -WakeOnMagicPacket Enabled -ErrorAction Stop
    Note "$n : allowed to wake the PC on a magic packet"
  } catch { Note "$n : couldn't set wake power management ($($_.Exception.Message))" }

  # Driver settings differ by vendor (Intel, Realtek, Killer...): turn on every
  # magic-packet / WoL switch the driver exposes, and the power savers that
  # are known to stop the card listening while the PC is off.
  $props = Get-NetAdapterAdvancedProperty -Name $n -ErrorAction SilentlyContinue
  foreach ($p in $props) {
    $d = $p.DisplayName
    $values = @($p.ValidDisplayValues)
    if ($d -match 'Magic Packet|Wake on LAN|WOL|Shutdown Wake|Wake from' -and $d -notmatch 'Pattern|Link') {
      $target = @('Enabled', 'On') | Where-Object { $values -contains $_ } | Select-Object -First 1
      if ($target -and $p.DisplayValue -ne $target) {
        try { Set-NetAdapterAdvancedProperty -Name $n -DisplayName $d -DisplayValue $target -ErrorAction Stop; Note "$n : $d -> $target" } catch { Note "$n : couldn't change $d" }
      }
    }
    if ($d -match 'Energy.Efficient Ethernet|Green Ethernet|Power Saving Mode|Advanced EEE|Gigabit Lite') {
      $target = @('Disabled', 'Off') | Where-Object { $values -contains $_ } | Select-Object -First 1
      if ($target -and $p.DisplayValue -ne $target) {
        try { Set-NetAdapterAdvancedProperty -Name $n -DisplayName $d -DisplayValue $target -ErrorAction Stop; Note "$n : $d -> $target" } catch { }
      }
    }
  }

  # "Allow this device to wake the computer" in Device Manager.
  $wakeable = powercfg /devicequery wake_programmable
  $match = $wakeable | Where-Object { $_ -and $a.InterfaceDescription -like "*$($_.Trim())*" -or $_.Trim() -eq $a.InterfaceDescription } | Select-Object -First 1
  $dev = if ($match) { $match.Trim() } else { $a.InterfaceDescription }
  powercfg /deviceenablewake "$dev" | Out-Null
  if ($LASTEXITCODE -eq 0) { Note "$n : Device Manager wake permission on" } else { Note "$n : couldn't set Device Manager wake permission for '$dev'" }
}

try {
  Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power' -Name HiberbootEnabled -Value 0 -Type DWord -ErrorAction Stop
  Note 'Fast Startup turned off (it stops most network cards waking the PC from shutdown)'
} catch { Note "Couldn't turn off Fast Startup ($($_.Exception.Message))" }

# Let the phone app reach Nexus on every network profile (Windows often
# files home Wi-Fi as "Public", which silently blocks the phone link).
foreach ($r in @(@{ Name = 'ClashPoint Nexus phone link'; Proto = 'TCP'; Port = 11480 }, @{ Name = 'ClashPoint Nexus discovery'; Proto = 'UDP'; Port = 11481 })) {
  try {
    Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Protocol $r.Proto -LocalPort $r.Port -Action Allow -Profile Any -ErrorAction Stop | Out-Null
    Note "Firewall: allowed $($r.Proto) $($r.Port) for the phone app"
  } catch { Note "Couldn't add firewall rule for $($r.Proto) $($r.Port) ($($_.Exception.Message))" }
}

$log | ConvertTo-Json -Compress | Set-Content -Path $Out -Encoding UTF8
`

/**
 * Shows one UAC prompt (Windows' own), then applies the changes above.
 * Resolves after the elevated script finishes; declined UAC = ok:false.
 */
export async function runWolSetup(): Promise<WolSetupResult> {
  if (process.platform !== 'win32') return { ok: false, log: [], error: 'Windows only' }
  const dir = app.getPath('temp')
  const scriptPath = join(dir, `nexus-wol-setup-${process.pid}.ps1`)
  const outPath = join(dir, `nexus-wol-setup-${process.pid}.json`)
  await writeFile(scriptPath, SETUP_SCRIPT, 'utf-8')
  await unlink(outPath).catch(() => {})
  const launcher =
    `$p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden ` +
    `-ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','"${scriptPath}"','-Out','"${outPath}"'); exit $p.ExitCode`
  try {
    await runPowerShell(launcher, 120_000)
  } catch (error) {
    await unlink(scriptPath).catch(() => {})
    const message = error instanceof Error ? error.message : String(error)
    const declined = /canceled by the user|cancelled by the user|operation was canceled/i.test(message)
    return { ok: false, log: [], error: declined ? 'Admin permission was declined' : message }
  }
  let log: string[] = []
  try {
    const parsed = JSON.parse((await readFile(outPath, 'utf-8')).replace(/^﻿/, ''))
    log = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)]
  } catch {
    log = ['Setup ran, but its log could not be read']
  }
  await unlink(scriptPath).catch(() => {})
  await unlink(outPath).catch(() => {})
  appendLog('info', `[wol] setup: ${log.join(' | ')}`)
  return { ok: true, log, error: null }
}
