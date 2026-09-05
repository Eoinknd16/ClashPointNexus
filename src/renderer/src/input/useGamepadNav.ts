import { useEffect } from 'react'
import { emitNav, type NavAction } from './navBus'

// Two-threshold (hysteresis) deadzone: a direction only "presses" once the
// stick exceeds PRESS, and only "releases" once it drops back under RELEASE.
// A single shared threshold caused rapid up/down flicker right at the
// boundary on some USB-connected controllers (read as a burst of presses) —
// this is the actual fix for that, not just the min-gap floor below.
const PRESS_DEADZONE = 0.6
const RELEASE_DEADZONE = 0.25
const INITIAL_REPEAT_DELAY_MS = 380
const REPEAT_INTERVAL_MS = 150
// Hard floor between any two direction emissions, including the first
// "press" one. Defends against contact-bounce on the digital dpad too —
// whichever of the two turns out to be the real cause on a given controller.
const MIN_DIRECTION_GAP_MS = 90
const MIN_BUTTON_GAP_MS = 60

// Standard gamepad mapping (W3C) — DualSense and Xbox controllers both
// map to this layout in Chromium, dpad and left stick both drive nav.
//
// Several of these fire a different, unrelated action depending on which
// zone is listening — same pattern as left/right meaning "seek" in the
// player but "move focus" in a filters row. In particular, the on-screen
// keyboard zone (shared by Games/TV search, Browse's address bar, and
// Settings fields) reinterprets Square/R1/R2 as Backspace/Submit/Shift,
// since toggleSubtitles/nextStream/volumeUp mean nothing while typing.
const BUTTON_CONFIRM = 0
const BUTTON_BACK = 1
const BUTTON_SQUARE = 2 // toggleSubtitles elsewhere, Backspace while typing
const BUTTON_TRIANGLE = 3 // universal "open search" shortcut
const BUTTON_MENU = 9
const BUTTON_L1 = 4 // previous stream
const BUTTON_R1 = 5 // nextStream elsewhere, Submit while typing
const BUTTON_L2 = 6 // volume down
const BUTTON_R2 = 7 // volumeUp elsewhere, Shift while typing
const BUTTON_SHARE = 8 // skip to next episode
const BUTTON_DPAD_UP = 12
const BUTTON_DPAD_DOWN = 13
const BUTTON_DPAD_LEFT = 14
const BUTTON_DPAD_RIGHT = 15

const EDGE_BUTTONS: Array<[number, NavAction]> = [
  [BUTTON_CONFIRM, 'confirm'],
  [BUTTON_BACK, 'back'],
  [BUTTON_MENU, 'menu'],
  [BUTTON_SQUARE, 'toggleSubtitles'],
  [BUTTON_TRIANGLE, 'search'],
  [BUTTON_SHARE, 'skipNext'],
  [BUTTON_L1, 'prevStream'],
  [BUTTON_R1, 'nextStream'],
  [BUTTON_L2, 'volumeDown'],
  [BUTTON_R2, 'volumeUp']
]

/**
 * Polls navigator.getGamepads() every frame and turns dpad/stick/face-button
 * input into normalized NavAction events on the shared nav bus. Mount once
 * at the app root — screens consume via useNavListener, not this hook.
 */
export function useGamepadNav(): void {
  useEffect(() => {
    let rafId: number
    let pressed = new Set<number>()
    let lastPressAt = new Map<number, number>()
    let stickEngaged = false
    let heldDirection: NavAction | null = null
    let nextRepeatAt = 0
    let lastDirectionEmitAt = -Infinity
    const seenGamepads = new Set<number>()

    // A controller connected mid-session (not present at boot) doesn't show up
    // in getGamepads() until Chromium actually registers it — which on some
    // setups only happens after the OS has finished enumerating it, not the
    // instant it's plugged in. These events fire the moment Chromium *does*
    // notice it, and disconnect resets all per-controller state so a later
    // reconnect (same or different pad) starts clean instead of carrying over
    // stale press/timing state from before it was unplugged.
    const handleConnect = (event: GamepadEvent): void => {
      // eslint-disable-next-line no-console
      console.log('[gamepad] connected:', event.gamepad.id, '| index:', event.gamepad.index)
    }
    const handleDisconnect = (event: GamepadEvent): void => {
      // eslint-disable-next-line no-console
      console.log('[gamepad] disconnected:', event.gamepad.id, '| index:', event.gamepad.index)
      pressed = new Set()
      lastPressAt = new Map()
      stickEngaged = false
      heldDirection = null
      nextRepeatAt = 0
      lastDirectionEmitAt = -Infinity
      seenGamepads.delete(event.gamepad.index)
    }
    window.addEventListener('gamepadconnected', handleConnect)
    window.addEventListener('gamepaddisconnected', handleDisconnect)

    const fireOnce = (buttonIndex: number, action: NavAction, isPressed: boolean, time: number): void => {
      const wasPressed = pressed.has(buttonIndex)
      if (isPressed && !wasPressed) {
        const last = lastPressAt.get(buttonIndex) ?? -Infinity
        pressed.add(buttonIndex)
        if (time - last >= MIN_BUTTON_GAP_MS) {
          lastPressAt.set(buttonIndex, time)
          emitNav(action)
        }
      } else if (!isPressed && wasPressed) {
        pressed.delete(buttonIndex)
      }
    }

    const computeDirection = (pad: Gamepad): NavAction | null => {
      if (pad.buttons[BUTTON_DPAD_UP]?.pressed) return 'up'
      if (pad.buttons[BUTTON_DPAD_DOWN]?.pressed) return 'down'
      if (pad.buttons[BUTTON_DPAD_LEFT]?.pressed) return 'left'
      if (pad.buttons[BUTTON_DPAD_RIGHT]?.pressed) return 'right'

      const stickX = pad.axes[0] ?? 0
      const stickY = pad.axes[1] ?? 0
      const magnitude = Math.max(Math.abs(stickX), Math.abs(stickY))

      if (stickEngaged) {
        if (magnitude < RELEASE_DEADZONE) {
          stickEngaged = false
          return null
        }
      } else if (magnitude < PRESS_DEADZONE) {
        return null
      } else {
        stickEngaged = true
      }

      if (Math.abs(stickY) >= Math.abs(stickX)) return stickY < 0 ? 'up' : 'down'
      return stickX < 0 ? 'left' : 'right'
    }

    const tick = (time: number): void => {
      const pads = navigator.getGamepads()

      // Some setups (Steam running in the background, DS4Windows-style tools)
      // expose the same physical controller as a second virtual XInput device —
      // usually only over USB, not Bluetooth, which matches the "double input,
      // USB only" symptom exactly. Processing every connected pad's shared
      // press/release state can still glitch if the two reports aren't
      // perfectly time-aligned, so only the lowest-indexed pad drives nav —
      // this app has no need for simultaneous multi-controller input anyway.
      const pad = pads.find((p) => p !== null)

      if (pad) {
        if (!seenGamepads.has(pad.index)) {
          seenGamepads.add(pad.index)
          // eslint-disable-next-line no-console
          console.log('[gamepad] using:', pad.id, '| mapping:', pad.mapping || '(none)')
          const others = pads.filter((p) => p && p.index !== pad.index)
          if (others.length > 0) {
            // eslint-disable-next-line no-console
            console.log(
              '[gamepad] ignoring additional connected pad(s):',
              others.map((p) => p?.id)
            )
          }
        }

        for (const [buttonIndex, action] of EDGE_BUTTONS) {
          fireOnce(buttonIndex, action, pad.buttons[buttonIndex]?.pressed ?? false, time)
        }

        const direction = computeDirection(pad)
        if (direction) {
          if (direction !== heldDirection) {
            if (time - lastDirectionEmitAt >= MIN_DIRECTION_GAP_MS) {
              heldDirection = direction
              lastDirectionEmitAt = time
              nextRepeatAt = time + INITIAL_REPEAT_DELAY_MS
              emitNav(direction)
            }
          } else if (time >= nextRepeatAt) {
            lastDirectionEmitAt = time
            nextRepeatAt = time + REPEAT_INTERVAL_MS
            emitNav(direction)
          }
        } else {
          heldDirection = null
        }
      }

      // Always reschedule regardless of whether a pad was found this frame —
      // this is what actually broke last time: an early return here (when no
      // pad exists yet, e.g. right at startup before Chromium registers it)
      // silently kills the polling loop forever, since nothing else calls
      // requestAnimationFrame again.
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('gamepadconnected', handleConnect)
      window.removeEventListener('gamepaddisconnected', handleDisconnect)
    }
  }, [])
}
