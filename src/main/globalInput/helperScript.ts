// A persistent PowerShell process (P/Invoke into user32.dll/xinput1_4.dll,
// same technique as system/service.ts's volume control) rather than a native
// Node module — a native module needs a prebuilt binary matching this exact
// Electron version's ABI, which isn't verifiable without a live test; this
// approach has zero dependency/ABI risk at the cost of being a slower,
// coarser-grained loop than a real native binding would be.
//
// XInput (unlike the browser's Gamepad API this whole app otherwise runs on)
// polls the controller driver directly and has no concept of window focus —
// that's what makes reading it from a standalone process work at all
// regardless of which window is focused.
//
// Two combos, both requiring 500ms held (not just pressed) so neither is
// remotely reachable by accident during normal play:
//   L1+R1+Start -> "COMBO_QUICKMENU"  (bring Nexus to front, open Quick Menu)
//   L1+R1+Back  -> toggle Mouse Mode, "MOUSE_MODE_ON"/"MOUSE_MODE_OFF"
// A "TOGGLE_MOUSE" line on stdin does the same toggle, for the in-app Quick
// Menu button — read on a background .NET thread (pure C#, started once via
// StartStdinListener below), not polled inline in the main loop. An earlier
// version used [Console]::In.Peek() each tick to check non-blockingly, but
// Peek() on a piped/redirected stdin actually BLOCKS until data arrives —
// confirmed by actually running it, not by assumption — which meant the
// entire polling loop (both combos, everything) never ran at all until
// something was written to stdin, which normally never happens on its own.
// A raw PowerShell scriptblock isn't safe to run on a manually-created
// background thread (the engine has real thread-affinity constraints), so
// the listener itself is plain C#, only setting a static flag the main loop
// checks non-blockingly.
//
// While Mouse Mode is on: right stick moves the real OS cursor, A/B are
// left/right click, triggers are scroll wheel.
//
// Diagnostics — "HELPER_STARTED" once at launch, plus edge-triggered
// "CONTROLLER_CONNECTED"/"CONTROLLER_DISCONNECTED" whenever XInputGetState's
// result changes — added after a real-world report of Mouse Mode not working
// at all, with no way to tell whether that meant "no controller detected"
// (XInput only recognizes Xbox controllers and things explicitly remapped to
// emulate one, e.g. DS4Windows/Steam Input — a DualSense/DualShock plugged in
// directly won't show up here even though Chromium's separate Gamepad API,
// which the rest of this app runs on, reads it fine) versus a combo/logic bug.
export const GLOBAL_INPUT_HELPER_SCRIPT = `
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;

public struct XINPUT_GAMEPAD {
    public ushort wButtons;
    public byte bLeftTrigger;
    public byte bRightTrigger;
    public short sThumbLX;
    public short sThumbLY;
    public short sThumbRX;
    public short sThumbRY;
}

public struct XINPUT_STATE {
    public uint dwPacketNumber;
    public XINPUT_GAMEPAD Gamepad;
}

public struct POINT { public int X; public int Y; }

public class ClashPointNativeInput {
    [DllImport("xinput1_4.dll")]
    public static extern uint XInputGetState(uint dwUserIndex, ref XINPUT_STATE pState);

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

$BTN_DPAD_UP = 0x0001
$BTN_DPAD_DOWN = 0x0002
$BTN_DPAD_LEFT = 0x0004
$BTN_DPAD_RIGHT = 0x0008
$BTN_START = 0x0010
$BTN_BACK = 0x0020
$BTN_LEFT_THUMB = 0x0040
$BTN_RIGHT_THUMB = 0x0080
$BTN_LEFT_SHOULDER = 0x0100
$BTN_RIGHT_SHOULDER = 0x0200
$BTN_A = 0x1000
$BTN_B = 0x2000

$QUICKMENU_COMBO = $BTN_LEFT_SHOULDER -bor $BTN_RIGHT_SHOULDER -bor $BTN_START
$MOUSEMODE_COMBO = $BTN_LEFT_SHOULDER -bor $BTN_RIGHT_SHOULDER -bor $BTN_BACK
$HOLD_MS = 500
$RIGHT_STICK_DEADZONE = 8689
$CURSOR_SPEED = 0.0018
$SCROLL_DEADZONE = 30

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
# boolean $connected against a starting $null silently evaluates as "same"
# whenever the initial read is $false, and the very first state never gets
# reported. Caught by actually running this before shipping, not by
# reasoning about it.
$prevConnectedState = "unknown"

Write-Output "HELPER_STARTED"

while ($true) {
  if ([ClashPointNativeInput]::ToggleMouseRequested) {
    [ClashPointNativeInput]::ToggleMouseRequested = $false
    $mouseMode = -not $mouseMode
    if ($mouseMode) { Write-Output "MOUSE_MODE_ON" } else { Write-Output "MOUSE_MODE_OFF" }
  }

  $state = New-Object XINPUT_STATE
  $result = [ClashPointNativeInput]::XInputGetState(0, [ref]$state)
  $connectedState = if ($result -eq 0) { "yes" } else { "no" }

  if ($connectedState -ne $prevConnectedState) {
    if ($connectedState -eq "yes") { Write-Output "CONTROLLER_CONNECTED" } else { Write-Output "CONTROLLER_DISCONNECTED" }
    $prevConnectedState = $connectedState
  }

  if ($result -eq 0) {
    $gp = $state.Gamepad
    $held = $gp.wButtons

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
      $rx = [int]$gp.sThumbRX
      $ry = [int]$gp.sThumbRY
      $mag = [Math]::Sqrt([double]($rx * $rx + $ry * $ry))
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

      if ($gp.bRightTrigger -gt $SCROLL_DEADZONE) {
        [ClashPointNativeInput]::mouse_event(0x0800, 0, 0, 60, [UIntPtr]::Zero)
      } elseif ($gp.bLeftTrigger -gt $SCROLL_DEADZONE) {
        [ClashPointNativeInput]::mouse_event(0x0800, 0, 0, -60, [UIntPtr]::Zero)
      }
    }
  }

  Start-Sleep -Milliseconds 16
}
`
