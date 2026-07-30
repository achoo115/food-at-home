import { describe, it, expect } from 'vitest'
import { daysUntilExpiry, startOfLocalDay } from './expiry'

// `now` is always built with the local-time Date constructor, so these tests
// assert the same thing in every timezone.
const localNoon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0)

describe('daysUntilExpiry', () => {
  it('returns 0 for an item expiring today', () => {
    expect(daysUntilExpiry('2026-07-30', localNoon(2026, 7, 30))).toBe(0)
  })

  it('returns 1 for an item expiring tomorrow', () => {
    expect(daysUntilExpiry('2026-07-31', localNoon(2026, 7, 30))).toBe(1)
  })

  it('returns a negative count for an item already expired', () => {
    expect(daysUntilExpiry('2026-07-28', localNoon(2026, 7, 30))).toBe(-2)
  })

  // The purity bug: Date.now() in render meant an unrelated re-render could
  // change the answer, because the baseline moved with the clock.
  it('gives the same answer at every hour of the same local day', () => {
    const answers = new Set<number | null>()
    for (let hour = 0; hour < 24; hour++) {
      answers.add(daysUntilExpiry('2026-08-02', new Date(2026, 6, 30, hour, 30, 0)))
    }
    expect([...answers]).toEqual([3])
  })

  // The skew bug: new Date('2026-07-31') is UTC midnight, but the baseline was
  // local midnight. West of UTC that shifted results by a day late in the evening.
  it('reads a date-only string as a local calendar date, not a UTC instant', () => {
    // 8pm local on the 30th is already the 31st in UTC.
    expect(daysUntilExpiry('2026-07-31', new Date(2026, 6, 30, 20, 0, 0))).toBe(1)
    // 3am local on the 31st is still the 30th in a UTC+ timezone.
    expect(daysUntilExpiry('2026-07-31', new Date(2026, 6, 31, 3, 0, 0))).toBe(0)
  })

  it('counts whole calendar days across a month boundary', () => {
    expect(daysUntilExpiry('2026-08-01', localNoon(2026, 7, 30))).toBe(2)
  })

  it('counts whole calendar days across a DST transition', () => {
    // US DST ends 2026-11-01; the span is 8 calendar days regardless.
    expect(daysUntilExpiry('2026-11-05', localNoon(2026, 10, 28))).toBe(8)
  })

  it('returns null when there is no expiry date', () => {
    expect(daysUntilExpiry(null, localNoon(2026, 7, 30))).toBeNull()
    expect(daysUntilExpiry('', localNoon(2026, 7, 30))).toBeNull()
  })

  it('returns null for an unparseable date instead of a wild number', () => {
    expect(daysUntilExpiry('not-a-date', localNoon(2026, 7, 30))).toBeNull()
  })

  it('accepts a full timestamp for expiry as well as a date-only string', () => {
    expect(daysUntilExpiry('2026-07-31T00:00:00Z', localNoon(2026, 7, 30))).not.toBeNull()
  })
})

describe('startOfLocalDay', () => {
  it('lands on local midnight', () => {
    const d = new Date(startOfLocalDay(new Date(2026, 6, 30, 17, 42, 9)))
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0])
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 6, 30])
  })

  it('is identical at every hour of the same local day', () => {
    const stamps = new Set<number>()
    for (let hour = 0; hour < 24; hour++) {
      stamps.add(startOfLocalDay(new Date(2026, 6, 30, hour, 15, 0)))
    }
    expect(stamps.size).toBe(1)
  })

  it('advances to the next local midnight on the following day', () => {
    const a = startOfLocalDay(new Date(2026, 6, 30, 23, 59, 59))
    const b = startOfLocalDay(new Date(2026, 6, 31, 0, 0, 1))
    expect(b).toBeGreaterThan(a)
    expect(new Date(b).getDate()).toBe(31)
  })
})
