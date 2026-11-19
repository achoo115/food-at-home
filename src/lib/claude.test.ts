import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// The REAL supabase-js functions client over a fetch that never answers: the
// timeout has to travel from generateRecipe through invoke() to an abort of
// the request, which a mocked invoke() could not show.
const state = vi.hoisted(() => ({ aborted: 0, started: 0 }))
vi.mock('./supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const hung = (_url: unknown, init?: { signal?: AbortSignal }) => new Promise<Response>((_res, rej) => {
    state.started++
    init?.signal?.addEventListener('abort', () => { state.aborted++; rej(new DOMException('The operation was aborted.', 'AbortError')) })
  })
  return { supabase: createClient('http://localhost:54321', 'test-key', { global: { fetch: hung as typeof fetch }, auth: { persistSession: false, autoRefreshToken: false } }) }
})
import { generateRecipe, GENERATE_TIMEOUT_MS } from './claude'

beforeEach(() => { state.aborted = 0; state.started = 0; vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('generateRecipe', () => {
  it('gives up on a request that never answers, and not before the limit', async () => {
    let outcome: 'pending' | 'resolved' | 'rejected' = 'pending'
    let message = ''
    generateRecipe({ ingredients: ['rice'] }).then(() => { outcome = 'resolved' }, (e: Error) => { outcome = 'rejected'; message = e.message })
    await vi.advanceTimersByTimeAsync(GENERATE_TIMEOUT_MS - 1000)
    expect(state.started).toBe(1)
    expect(outcome).toBe('pending')
    await vi.advanceTimersByTimeAsync(2000)
    expect(outcome).toBe('rejected')
    expect(message).toMatch(/^Recipe generation failed/)
    expect(state.aborted).toBe(1)
  })
})
