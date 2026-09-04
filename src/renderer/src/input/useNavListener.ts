import { useEffect, useRef } from 'react'
import { subscribeNav, type NavAction } from './navBus'
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
