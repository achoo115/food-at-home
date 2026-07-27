import { useEffect, useRef, useState } from 'react'

// Keep the screen awake while cooking (the thing NYT's own app notably lacks).
// Two gotchas the Wake Lock API forces on us:
//   - the lock auto-releases when the tab is hidden / screen turns off, so we
//     must re-acquire on visibilitychange when we come back, and
//   - request() can reject (old iOS, battery-saver, no user gesture) — degrade
//     silently to a no-op rather than throwing.
// Returns whether a lock is currently held, for a "screen staying on" indicator.
export function useWakeLock(active: boolean): boolean {
  const sentinelRef = useRef<WakeLockSentinel | null>(null)
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (!active) return
    const nav = navigator as Navigator & { wakeLock?: WakeLock }
    if (!nav.wakeLock) return

    let cancelled = false

    async function acquire() {
      try {
        const sentinel = await nav.wakeLock!.request('screen')
        if (cancelled) { sentinel.release().catch(() => {}); return }
        sentinelRef.current = sentinel
        setHeld(true)
        // On auto-release (tab hidden), clear the ref so onVisibility re-acquires.
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null
          setHeld(false)
        })
      } catch {
        setHeld(false)
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible' && !sentinelRef.current) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      sentinelRef.current?.release().catch(() => {})
      sentinelRef.current = null
      setHeld(false)
    }
  }, [active])

  return held
}
