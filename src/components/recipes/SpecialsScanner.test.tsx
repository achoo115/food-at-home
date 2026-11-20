// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

// The REAL supabase-js functions client; the page whose image is "hang" never
// answers, the other returns one deal.
const sent = vi.hoisted(() => ({ n: 0 }))
vi.mock('../../lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const net = (_url: unknown, init?: { signal?: AbortSignal; body?: unknown }) => {
    sent.n++
    if (String(init?.body).includes(btoa('hang'))) {
      return new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new DOMException('The operation was aborted.', 'AbortError')))
      })
    }
    return Promise.resolve(new Response(JSON.stringify([{ item: 'Chicken thighs', sale_price: 1.99, regular_price: 3.49 }]), { headers: { 'content-type': 'application/json' } }))
  }
  return { supabase: createClient('http://localhost:54321', 'test-key', { global: { fetch: net as typeof fetch }, auth: { persistSession: false, autoRefreshToken: false } }) }
})
import { SpecialsScanner } from './SpecialsScanner'

beforeEach(() => { sent.n = 0; vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
afterEach(() => { vi.useRealTimers(); cleanup() })

describe('SpecialsScanner', () => {
  it('a flyer page that never answers is given up on; the pages that did parse are saved and the missing page is reported', async () => {
    const onScanned = vi.fn<(items: unknown[]) => Promise<void>>(async () => {})
    const onDone = vi.fn()
    const { container } = render(<SpecialsScanner onScanned={onScanned} onDone={onDone} />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [new File(['hang'], 'p1.png', { type: 'image/png' }), new File(['fine'], 'p2.png', { type: 'image/png' })], configurable: true })
    await act(async () => { fireEvent.change(input) })
    await vi.waitFor(() => expect(sent.n).toBe(2)) // both pages read and sent
    await act(async () => { await vi.advanceTimersByTimeAsync(55_000) })
    expect(onScanned).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000) })
    expect(onScanned).toHaveBeenCalledTimes(1)
    expect(onScanned.mock.calls[0][0]).toEqual([{ item: 'Chicken thighs', sale_price: 1.99, regular_price: 3.49 }])
    // The save replaced this week's deals, so the scanner stays open to say a page is missing.
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByText(/Saved 1 deals, but 1 of 2 pages could not be read/)).toBeTruthy()
    fireEvent.click(screen.getByText('Done'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('when every page parses, the scanner saves and closes with no warning', async () => {
    const onScanned = vi.fn<(items: unknown[]) => Promise<void>>(async () => {})
    const onDone = vi.fn()
    const { container } = render(<SpecialsScanner onScanned={onScanned} onDone={onDone} />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [new File(['fine'], 'p1.png', { type: 'image/png' })], configurable: true })
    await act(async () => { fireEvent.change(input) })
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onScanned).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/could not be read/)).toBeNull()
  })

  it('when the save fails, the scanner shows why and stays open instead of closing as if saved', async () => {
    const onScanned = vi.fn<(items: unknown[]) => Promise<void>>(async () => { throw new Error("Could not save the deals — last scan's deals are unchanged. Try again.") })
    const onDone = vi.fn()
    const { container } = render(<SpecialsScanner onScanned={onScanned} onDone={onDone} />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [new File(['fine'], 'p1.png', { type: 'image/png' })], configurable: true })
    await act(async () => { fireEvent.change(input) })
    await vi.waitFor(() => expect(screen.getByText(/last scan's deals are unchanged/)).toBeTruthy())
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByText('Take a photo of the flyer')).toBeTruthy() // ready to try again
  })
})
