import { useEffect, useRef } from 'react'
import { setOverrideNav, subscribeNav, type NavAction } from './navBus'
import { useNavigationStore, type ScreenId } from '../state/navigationStore'

/**
 * Subscribes a screen/component to nav events while it's mounted.
 *
 * Pass this screen's own id when the caller is a top-level screen (not a
 * modal/overlay component). AnimatePresence keeps the outgoing screen fully
 * mounted — hooks, state, and this subscription all still live — for its
 * ~220ms exit fade after navigationStore.screen has already changed, so a
 * button press right after "back" can otherwise land on the screen that's on
 * its way out instead of the one now showing. Checking the live current
 * screen on every event (not just at mount) closes that window.
 */
export function useNavListener(handler: (action: NavAction) => void, screenId?: ScreenId): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(
    () =>
      subscribeNav((action) => {
        if (screenId && useNavigationStore.getState().screen !== screenId) return
        handlerRef.current(action)
      }),
    [screenId]
  )
}

/**
 * Gives one handler exclusive nav input while `active` is true — every other
 * subscriber (whatever screen happens to be showing underneath) stops
 * receiving nav events for as long as this is on, same idea as a modal
 * capturing focus. Used by the Quick Menu overlay, which must work identically
 * regardless of which screen it was opened over.
 */
export function useExclusiveNavListener(handler: (action: NavAction) => void, active: boolean): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!active) return
    setOverrideNav((action) => handlerRef.current(action))
    return () => setOverrideNav(null)
  }, [active])
}
