const MS_PER_DAY = 1000 * 60 * 60 * 24
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Local midnight of the day `now` falls in, as a timestamp. */
export function startOfLocalDay(now: Date | number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Whole calendar days from `now` until `expiryDate`. 0 means "expires today",
 * negative means already expired, null means there is no usable expiry date.
 *
 * `expiry_date` is a Postgres `date`, so it arrives as "YYYY-MM-DD". Passing
 * that to `new Date()` parses it as UTC midnight, which is a different instant
 * from the local midnight it gets compared against — west of UTC that shifted
 * results by a full day during the evening. Both sides are therefore reduced to
 * a calendar day before subtracting, which also makes the result independent of
 * the time of day (so it is stable across re-renders) and of DST.
 */
export function daysUntilExpiry(
  expiryDate: string | null | undefined,
  now: Date | number,
): number | null {
  if (!expiryDate) return null

  const today = new Date(now)
  if (Number.isNaN(today.getTime())) return null

  let target: number
  const parts = DATE_ONLY.exec(expiryDate)
  if (parts) {
    target = Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
  } else {
    const parsed = new Date(expiryDate)
    if (Number.isNaN(parsed.getTime())) return null
    target = Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  }

  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((target - base) / MS_PER_DAY)
}
