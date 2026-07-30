import { useEffect, useState } from 'react'
import { startOfLocalDay } from '../lib/expiry'

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Local midnight of the current day, as a stable timestamp.
 *
 * Reading the clock during render makes render non-idempotent: the same state
 * could produce a different "days left" on an unrelated re-render. Holding the
 * day in state keeps render pure, and re-arming a timer at each rollover means
 * a session left open overnight still shows the correct day.
 */
export function useToday(): number {
  const [today, setToday] = useState(() => startOfLocalDay(Date.now()))

  useEffect(() => {
    // +1s of slack so the timer never lands a hair before midnight and re-reads
    // the same day, which would busy-loop the timeout.
    const msUntilTomorrow = today + MS_PER_DAY - Date.now() + 1000
    const timer = setTimeout(
      () => setToday(startOfLocalDay(Date.now())),
      Math.max(msUntilTomorrow, 1000),
    )
    return () => clearTimeout(timer)
  }, [today])

  return today
}
