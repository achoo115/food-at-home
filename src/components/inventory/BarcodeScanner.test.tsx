// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

// The camera library and the product lookup are the two outside seams.
// Like the real class (html5-qrcode.js:225), stop() THROWS when the scanner is
// not running — it does not reject.
const cam = vi.hoisted(() => ({ started: [] as ((text: string) => Promise<void>)[], denied: false, stops: 0 }))
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    running = false
    start(_c: unknown, _o: unknown, onDecoded: (text: string) => Promise<void>) {
      if (cam.denied) return Promise.reject(new Error('NotAllowedError'))
      this.running = true
      cam.started.push(onDecoded)
      return Promise.resolve()
    }
    stop() {
      if (!this.running) throw 'Cannot stop, scanner is not running or paused.'
      this.running = false
      cam.stops++
      return Promise.resolve()
    }
  },
}))
const lookup = vi.fn()
vi.mock('../../lib/openFoodFacts', () => ({ lookupBarcode: (...a: unknown[]) => lookup(...a) }))
vi.mock('./AddItemForm', () => ({ AddItemForm: () => <div>manual form</div> }))
import { BarcodeScanner } from './BarcodeScanner'

beforeEach(() => { cam.started.length = 0; cam.denied = false; cam.stops = 0; lookup.mockReset() })
afterEach(cleanup)

describe('BarcodeScanner', () => {
  it('after a barcode with no product, Scan again restarts the camera', async () => {
    lookup.mockResolvedValue(null)
    render(<BarcodeScanner onAdd={vi.fn()} onDone={vi.fn()} />)
    expect(cam.started).toHaveLength(1)
    await act(async () => { await cam.started[0]('0123456789012') })
    expect(screen.getByText(/No product found for barcode: 0123456789012/)).toBeTruthy()
    expect(screen.getByText('manual form')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByText('Scan again')) })
    expect(cam.started).toHaveLength(2)
    expect(screen.queryByText(/No product found/)).toBeNull()
  })

  it('a camera that never started does not crash the screen when the scanner shuts down', async () => {
    cam.denied = true
    const { unmount } = render(<BarcodeScanner onAdd={vi.fn()} onDone={vi.fn()} />)
    await screen.findByText('Camera access denied')
    expect(screen.getByText('manual form')).toBeTruthy()
    expect(() => unmount()).not.toThrow()
  })

  it('closing the scanner while the camera is running stops the camera', async () => {
    const { unmount } = render(<BarcodeScanner onAdd={vi.fn()} onDone={vi.fn()} />)
    expect(cam.started).toHaveLength(1)
    unmount()
    await act(async () => { await Promise.resolve() })
    expect(cam.stops).toBe(1)
  })
})
