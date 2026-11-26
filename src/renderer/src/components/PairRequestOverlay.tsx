import { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { useExclusiveNavListener } from '../input/useNavListener'
import type { RemotePairRequest } from '@shared/remoteTypes'

/**
 * "Link this phone?" -- shown when the Nexus Android app asks to pair
 * automatically (main/remote/server.ts /api/pair-request). Same code is shown
 * on the phone, so you can tell it's really yours. Controller: Left/Right to
 * pick, Confirm to answer, Back = Deny. Mouse/touch work too. Unanswered
 * requests expire on the phone's side after two minutes.
 */
export function PairRequestOverlay(): JSX.Element | null {
  const [queue, setQueue] = useState<RemotePairRequest[]>([])
  const [choice, setChoice] = useState<0 | 1>(0)
  const current = queue[0] ?? null

  useEffect(
    () =>
      window.api.remote.onPairRequest((request) => {
        setQueue((q) => (q.some((r) => r.id === request.id) ? q : [...q, request]))
        setChoice(0)
      }),
    []
  )

  // Drop it after the same 2 minutes the server waits, so a stale prompt doesn't linger.
  useEffect(() => {
    if (!current) return
    const timer = setTimeout(() => setQueue((q) => q.filter((r) => r.id !== current.id)), 2 * 60 * 1000)
    return () => clearTimeout(timer)
  }, [current])

  function answer(approve: boolean): void {
    if (!current) return
    void window.api.remote.respondPair(current.id, approve).catch(() => {})
    setQueue((q) => q.slice(1))
    setChoice(0)
  }

  useExclusiveNavListener((action) => {
    if (action === 'left' || action === 'right') setChoice((c) => (c === 0 ? 1 : 0))
    else if (action === 'confirm') answer(choice === 0)
    else if (action === 'back') answer(false)
  }, current !== null)

  if (!current) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
      <div className="flex w-[32rem] max-w-[90vw] flex-col items-center gap-5 rounded-panel bg-surface p-8 text-center shadow-2xl ring-1 ring-white/15">
        <Smartphone className="h-12 w-12 text-accent" />
        <div className="text-2xl font-bold">Link {current.deviceName}?</div>
        <div className="text-muted">
          It wants to control Nexus and send things to this TV. Check the code matches the one on the phone.
        </div>
        <div className="font-mono text-5xl font-bold tracking-[0.4em] text-accent">{current.code}</div>
        <div className="flex gap-4">
          <button
            onClick={() => answer(true)}
            className={`rounded-full px-8 py-3 text-lg font-semibold ${choice === 0 ? 'bg-accent text-white ring-2 ring-accent ring-offset-2 ring-offset-bg' : 'bg-white/10'}`}
          >
            Allow
          </button>
          <button
            onClick={() => answer(false)}
            className={`rounded-full px-8 py-3 text-lg font-semibold ${choice === 1 ? 'bg-white/30 ring-2 ring-white ring-offset-2 ring-offset-bg' : 'bg-white/10'}`}
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  )
}
