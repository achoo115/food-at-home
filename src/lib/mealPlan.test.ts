import { describe, it, expect } from 'vitest'
import { weekStart, rankForRotation } from './mealPlan'

describe('weekStart', () => {
  it('returns the Monday of the week (local)', () => {
    expect(weekStart(new Date(2026, 6, 27))).toBe('2026-07-27') // Mon Jul 27
    expect(weekStart(new Date(2026, 6, 30))).toBe('2026-07-27') // Thu → same Mon
    expect(weekStart(new Date(2026, 7, 2))).toBe('2026-07-27')  // Sun → same Mon
    expect(weekStart(new Date(2026, 7, 3))).toBe('2026-08-03')  // next Mon
  })
})

describe('rankForRotation', () => {
  const now = new Date(2026, 6, 27)
  const r = (id: string, last_cooked_at: string | null, is_favorited = false) => ({ id, last_cooked_at, is_favorited })

  it('sinks recently-cooked meals below eligible ones', () => {
    const recent = r('recent', '2026-07-25')      // 2 days ago
    const stale = r('stale', '2026-06-01')          // ~8 weeks ago
    const ranked = rankForRotation([recent, stale], { now, recencyDays: 14 })
    expect(ranked.map((x) => x.id)).toEqual(['stale', 'recent'])
  })

  it('favorites rise within the eligible group', () => {
    const fav = r('fav', null, true)
    const plain = r('plain', null, false)
    const ranked = rankForRotation([plain, fav], { now, recencyDays: 14 })
    expect(ranked[0].id).toBe('fav')
  })

  it('never-cooked counts as oldest (comes before an old-but-cooked one)', () => {
    const never = r('never', null)
    const old = r('old', '2026-05-01')
    const ranked = rankForRotation([old, never], { now, recencyDays: 14 })
    expect(ranked[0].id).toBe('never')
  })

  it('does not mutate the input array', () => {
    const input = [r('a', '2026-07-25'), r('b', null)]
    const copy = [...input]
    rankForRotation(input, { now })
    expect(input).toEqual(copy)
  })
})
