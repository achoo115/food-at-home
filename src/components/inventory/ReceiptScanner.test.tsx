// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'

// The scan call and the image transcode are the two browser seams; everything
// else in the component runs for real. The invoke mock records whether the
// AbortSignal it was handed fired — the 2026-10-31 auditor found the cleanup
// effect aborting every scan it had just started (a timeout on every receipt).
const invoke = vi.fn()
vi.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))
vi.mock('../../lib/imagePrep', async () => {
  const real = await vi.importActual<typeof import('../../lib/imagePrep')>('../../lib/imagePrep')
  return {
    ...real,
    prepareImage: vi.fn(async (f: File) => ({ base64: 'QUJD', mediaType: 'image/jpeg', previewUrl: `blob:${f.name}`, bytes: 3 })),
  }
})
import { ReceiptScanner } from './ReceiptScanner'

const GOYA = { name: 'Goya Kidney Beans', quantity: 1, unit_price: 2, line_total: 2, category: 'protein', location: 'pantry', container: 'can' }

function pick(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  fireEvent.change(input)
}

beforeEach(() => {
  invoke.mockReset()
  globalThis.URL.revokeObjectURL = vi.fn()
})
afterEach(cleanup)

describe('ReceiptScanner', () => {
  it('a library pick reaches the review list, and the in-flight request is NOT aborted by the preview effect', async () => {
    let aborted = false
    invoke.mockImplementation((_name: string, opts: { signal: AbortSignal }) => new Promise((resolve) => {
      opts.signal.addEventListener('abort', () => { aborted = true })
      setTimeout(() => resolve({ data: { items: [GOYA] }, error: null }), 50)
    }))
    const onAdd = vi.fn(async () => ({ data: {}, error: null }))
    const { container } = render(<ReceiptScanner onAdd={onAdd} onDone={() => {}} />)
    const library = container.querySelectorAll('input[type=file]')[1] as HTMLInputElement
    expect(library.multiple).toBe(true)
    pick(library, [new File(['x'], 'a.png', { type: 'image/png' }), new File(['y'], 'b.png', { type: 'image/png' })])

    await screen.findByText(/Goya Kidney Beans/)
    expect(aborted).toBe(false)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls[0][1].body.images).toHaveLength(2)
    expect(screen.getByText(/Found 1 item/)).toBeTruthy()
    expect((screen.getByLabelText('Location for Goya Kidney Beans') as HTMLSelectElement).value).toBe('pantry')
    expect(screen.queryByText(/timed out/)).toBeNull()
  })

  it('save passes the scanned container and post-promotion cost to onAdd and calls onDone', async () => {
    invoke.mockResolvedValue({ data: { items: [{ ...GOYA, unit_price: 2.39, line_total: 1.78 }] }, error: null })
    const onAdd = vi.fn(async () => ({ data: {}, error: null }))
    const onDone = vi.fn()
    const { container } = render(<ReceiptScanner onAdd={onAdd} onDone={onDone} />)
    pick(container.querySelectorAll('input[type=file]')[1] as HTMLInputElement, [new File(['x'], 'a.png', { type: 'image/png' })])
    await screen.findByText(/Goya Kidney Beans/)
    await act(async () => { fireEvent.click(screen.getByText(/Add 1 item/)) })
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Goya Kidney Beans', location: 'pantry', container: 'can', cost: 1.78, unit: 'count' }))
  })

  it('a failed row stays listed with an error instead of a stuck button', async () => {
    invoke.mockResolvedValue({ data: { items: [GOYA, { ...GOYA, name: 'Second Thing' }] }, error: null })
    const onAdd = vi.fn(async (i: { name: string }) => (i.name === 'Second Thing' ? { data: null, error: { message: 'nope' } } : { data: {}, error: null }))
    const onDone = vi.fn()
    const { container } = render(<ReceiptScanner onAdd={onAdd} onDone={onDone} />)
    pick(container.querySelectorAll('input[type=file]')[1] as HTMLInputElement, [new File(['x'], 'a.png', { type: 'image/png' })])
    await screen.findByText(/Found 2 items/)
    await act(async () => { fireEvent.click(screen.getByText(/Add 2 items/)) })
    await screen.findByText(/1 item could not be saved/)
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.queryByText(/Goya Kidney Beans/)).toBeNull()
    expect(screen.getByText(/Second Thing/)).toBeTruthy()
    expect(screen.getByText(/Add 1 item/)).toBeTruthy()
  })

  it('a function error is shown and the picker comes back (never stuck on Reading…)', async () => {
    invoke.mockResolvedValue({ data: { error: 'The reply was cut off — try fewer screenshots per scan' }, error: null })
    const { container } = render(<ReceiptScanner onAdd={vi.fn()} onDone={() => {}} />)
    pick(container.querySelectorAll('input[type=file]')[1] as HTMLInputElement, [new File(['x'], 'a.png', { type: 'image/png' })])
    await screen.findByText(/reply was cut off/)
    expect(screen.getByText('Take a photo')).toBeTruthy()
  })

  it('removing a row drops it from the save', async () => {
    invoke.mockResolvedValue({ data: { items: [GOYA, { ...GOYA, name: 'Second Thing' }] }, error: null })
    const onAdd = vi.fn(async (_i: { name: string }) => ({ data: {}, error: null }))
    const { container } = render(<ReceiptScanner onAdd={onAdd} onDone={() => {}} />)
    pick(container.querySelectorAll('input[type=file]')[1] as HTMLInputElement, [new File(['x'], 'a.png', { type: 'image/png' })])
    await screen.findByText(/Found 2 items/)
    fireEvent.click(screen.getByLabelText('Remove Second Thing'))
    await act(async () => { fireEvent.click(screen.getByText(/Add 1 item/)) })
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    expect(onAdd.mock.calls[0][0]).toMatchObject({ name: 'Goya Kidney Beans' })
  })
})
