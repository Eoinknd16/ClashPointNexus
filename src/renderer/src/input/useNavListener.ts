import { useEffect, useRef } from 'react'
import { subscribeNav, type NavAction } from './navBus'

/** Subscribes a screen/component to nav events while it's mounted. */
export function useNavListener(handler: (action: NavAction) => void): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => subscribeNav((action) => handlerRef.current(action)), [])
}
