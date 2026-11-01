import { describe, expect, it } from 'vitest'
import { targetSize, MAX_EDGE } from './imagePrep'

describe('targetSize', () => {
  it('leaves images at or under the cap alone', () => {
    expect(targetSize(1206, 2622 > MAX_EDGE ? 1500 : 2622)).toEqual({ width: 1206, height: 1500 })
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 })
  })
  it('scales the long edge to the cap and the short edge by the same factor (owner screenshot 1206×2622)', () => {
    const t = targetSize(1206, 2622)
    expect(t.height).toBe(1568)
    expect(t.width).toBe(Math.round(1206 * (1568 / 2622))) // 721
    expect(Math.abs(t.width / t.height - 1206 / 2622)).toBeLessThan(0.002)
  })
  it('handles landscape 12 MP (4032×3024) with non-integer scaling', () => {
    expect(targetSize(4032, 3024)).toEqual({ width: 1568, height: 1176 })
  })
})
