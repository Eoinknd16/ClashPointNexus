// A persistent PowerShell process rather than a native Node module — a
// native module needs a prebuilt binary matching this exact Electron
// version's ABI, which isn't verifiable without a live test; this approach
// has zero dependency/ABI risk at the cost of being a slower, coarser-
// grained loop than a real native binding would be.
//
// Controller reading is Windows.Gaming.Input.Gamepad (a WinRT API, loaded
// via PowerShell's WinRT type-projection syntax), not XInput. An XInput-
// based first version only ever recognized Xbox controllers and things
// explicitly remapped to emulate one (DS4Windows, Steam Input) — a
// DualSense/DualShock plugged in directly never showed up to it at all, per
// a real-world report. Windows.Gaming.Input.Gamepad has native DualSense/
// DualShock recognition built into the OS itself (mapped onto the same
// Xbox-shaped button/stick surface XInput exposes: Cross/Circle/Square/
// Triangle -> A/B/X/Y, Options/Share -> Menu/View, L1/R1 -> shoulders,
// L3/R3 -> thumbstick clicks) — no remapping tool needed. Like XInput, it
// polls the driver directly with no concept of window focus, which is what
// makes reading it from a standalone background process work at all.
//
// Two combos, both requiring 500ms held (not just pressed) so neither is
// remotely reachable by accident during normal play:
//   L1+R1+Menu -> "COMBO_QUICKMENU"  (bring Nexus to front, open Quick Menu)
//   L1+R1+View -> toggle Mouse Mode, "MOUSE_MODE_ON"/"MOUSE_MODE_OFF"
// ("Menu"/"View" are this API's names for Options/Share on a PlayStation
// pad, Start/Back on an Xbox pad.)
// A "TOGGLE_MOUSE" line on stdin does the same toggle, for the in-app Quick
// Menu button — read on a background .NET thread (pure C#, started once via
// StartStdinListener), not polled inline in the main loop. An earlier
// version polled stdin with [Console]::In.Peek() each tick, which turned out
// to actually BLOCK until data arrives on a piped/redirected stdin —
// confirmed by running it, not by assumption — which meant the entire
// polling loop never ran at all until something was written to stdin. A raw
// PowerShell scriptblock isn't safe to run on a manually-created background
// thread (the engine has real thread-affinity constraints), so the listener
// itself is plain C#, only setting a static flag the main loop checks
// non-blockingly.
//
// While Mouse Mode is on: right stick moves the real OS cursor, A/B
// (Cross/Circle) are left/right click, triggers are scroll wheel.
//
// Diagnostics — "HELPER_STARTED" once at launch, plus edge-triggered
// "CONTROLLER_CONNECTED"/"CONTROLLER_DISCONNECTED" whenever whether any
// Windows.Gaming.Input.Gamepad is present changes — added after a real-
// world report of this not working at all, with no way to tell why.
export const GLOBAL_INPUT_HELPER_SCRIPT = `
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;

public struct POINT { public int X; public int Y; }

public class ClashPointNativeInput {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    public static volatile bool ToggleMouseRequested = false;
    private static System.Threading.Thread stdinThread;

    public static void StartStdinListener() {
        stdinThread = new System.Threading.Thread(() => {
            string line;
            while ((line = Console.In.ReadLine()) != null) {
                if (line.Trim() == "TOGGLE_MOUSE") {
                    ToggleMouseRequested = true;
                }
            }
        });
        stdinThread.IsBackground = true;
        stdinThread.Start();
    }
}
'

[ClashPointNativeInput]::StartStdinListener()

# WinRT type projection — the standard PowerShell idiom for loading a
# Windows Runtime API. Needed once before [Windows.Gaming.Input.Gamepad]
# is usable as a type at all.
[Windows.Gaming.Input.Gamepad,Windows.Gaming.Input,ContentType=WindowsRuntime] | Out-Null

# GamepadButtons flags (Windows.Gaming.Input) -- stable, documented WinRT enum.
$BTN_MENU = 0x1
$BTN_VIEW = 0x2
$BTN_A = 0x4
$BTN_B = 0x8
$BTN_LEFT_SHOULDER = 0x400
$BTN_RIGHT_SHOULDER = 0x800

$QUICKMENU_COMBO = $BTN_LEFT_SHOULDER -bor $BTN_RIGHT_SHOULDER -bor $BTN_MENU
$MOUSEMODE_COMBO = $BTN_LEFT_SHOULDER -bor $BTN_RIGHT_SHOULDER -bor $BTN_VIEW
$HOLD_MS = 500
# Sticks here are already normalized doubles (-1.0..1.0), triggers 0.0..1.0 --
# a different scale than XInput's raw 16-bit/byte values, so these are tuned
# fresh rather than reused from the XInput-based first version.
$RIGHT_STICK_DEADZONE = 0.26
$CURSOR_SPEED = 60
$SCROLL_DEADZONE = 0.12

$screenW = [ClashPointNativeInput]::GetSystemMetrics(0)
$screenH = [ClashPointNativeInput]::GetSystemMetrics(1)

$mouseMode = $false
$quickMenuComboStart = $null
$quickMenuFiredForThisHold = $false
$mouseModeComboStart = $null
$mouseModeFiredForThisHold = $false
$prevA = $false
$prevB = $false
# A string sentinel, not $null/boolean -- PowerShell's -ne coerces $null to
# match the other operand's type when one side is a [bool], so comparing a
# boolean against a starting $null silently evaluates as "same" whenever the
# initial read is $false, and the very first state never gets reported.
# Caught by actually running an earlier version of this before shipping.
$prevConnectedState = "unknown"

Write-Output "HELPER_STARTED"

while ($true) {
  if ([ClashPointNativeInput]::ToggleMouseRequested) {
    [ClashPointNativeInput]::ToggleMouseRequested = $false
    $mouseMode = -not $mouseMode
    if ($mouseMode) { Write-Output "MOUSE_MODE_ON" } else { Write-Output "MOUSE_MODE_OFF" }
  }

  $gamepad = [Windows.Gaming.Input.Gamepad]::Gamepads | Select-Object -First 1
  $connectedState = if ($null -ne $gamepad) { "yes" } else { "no" }

  if ($connectedState -ne $prevConnectedState) {
    if ($connectedState -eq "yes") { Write-Output "CONTROLLER_CONNECTED" } else { Write-Output "CONTROLLER_DISCONNECTED" }
    $prevConnectedState = $connectedState
  }

  if ($null -ne $gamepad) {
    $reading = $gamepad.GetCurrentReading()
    $held = [int]$reading.Buttons

    if (($held -band $QUICKMENU_COMBO) -eq $QUICKMENU_COMBO) {
      if ($null -eq $quickMenuComboStart) {
        $quickMenuComboStart = Get-Date
        $quickMenuFiredForThisHold = $false
      } elseif ((-not $quickMenuFiredForThisHold) -and (((Get-Date) - $quickMenuComboStart).TotalMilliseconds -ge $HOLD_MS)) {
        Write-Output "COMBO_QUICKMENU"
        $quickMenuFiredForThisHold = $true
      }
    } else {
      $quickMenuComboStart = $null
      $quickMenuFiredForThisHold = $false
    }

    if (($held -band $MOUSEMODE_COMBO) -eq $MOUSEMODE_COMBO) {
      if ($null -eq $mouseModeComboStart) {
        $mouseModeComboStart = Get-Date
        $mouseModeFiredForThisHold = $false
      } elseif ((-not $mouseModeFiredForThisHold) -and (((Get-Date) - $mouseModeComboStart).TotalMilliseconds -ge $HOLD_MS)) {
        $mouseMode = -not $mouseMode
        if ($mouseMode) { Write-Output "MOUSE_MODE_ON" } else { Write-Output "MOUSE_MODE_OFF" }
        $mouseModeFiredForThisHold = $true
      }
    } else {
      $mouseModeComboStart = $null
      $mouseModeFiredForThisHold = $false
    }

    if ($mouseMode) {
      $rx = [double]$reading.RightThumbstickX
      $ry = [double]$reading.RightThumbstickY
      $mag = [Math]::Sqrt(($rx * $rx) + ($ry * $ry))
      if ($mag -gt $RIGHT_STICK_DEADZONE) {
        $pos = New-Object POINT
        [ClashPointNativeInput]::GetCursorPos([ref]$pos) | Out-Null
        $dx = [int]($rx * $CURSOR_SPEED)
        $dy = [int](-$ry * $CURSOR_SPEED)
        $nx = [Math]::Max(0, [Math]::Min($screenW - 1, $pos.X + $dx))
        $ny = [Math]::Max(0, [Math]::Min($screenH - 1, $pos.Y + $dy))
        [ClashPointNativeInput]::SetCursorPos($nx, $ny) | Out-Null
      }

      $aPressed = ($held -band $BTN_A) -ne 0
      if ($aPressed -and (-not $prevA)) {
        [ClashPointNativeInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
        [ClashPointNativeInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
      }
      $prevA = $aPressed

      $bPressed = ($held -band $BTN_B) -ne 0
      if ($bPressed -and (-not $prevB)) {
        [ClashPointNativeInput]::mouse_event(0x0008, 0, 0, 0, [UIntPtr]::Zero)
        [ClashPointNativeInput]::mouse_event(0x0010, 0, 0, 0, [UIntPtr]::Zero)
      }
      $prevB = $bPressed

      if ($reading.RightTrigger -gt $SCROLL_DEADZONE) {
        [ClashPointNativeInput]::mouse_event(0x0800, 0, 0, 60, [UIntPtr]::Zero)
      } elseif ($reading.LeftTrigger -gt $SCROLL_DEADZONE) {
        [ClashPointNativeInput]::mouse_event(0x0800, 0, 0, -60, [UIntPtr]::Zero)
      }
    }
  }

  Start-Sleep -Milliseconds 16
}
`
