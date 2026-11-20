// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react'

// The real card, scanner, hook and supabase-js client over the stub table.
vi.mock('../../lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const { makeNet } = await import('../../hooks/specialsTableStub')
  const net = makeNet([{ item: 'Chicken thighs', sale_price: 1.99, regular_price: 3.49 }])
  const supabase = createClient('http://localhost:54321', 'test-key', { global: { fetch: net as typeof fetch }, auth: { persistSession: false, autoRefreshToken: false } })
  supabase.auth.getUser = (async () => ({ data: { user: { id: 'u1' } }, error: null })) as unknown as typeof supabase.auth.getUser
  return { supabase }
})
import { SpecialsCard } from './SpecialsCard'
import { useSpecials } from '../../hooks/useSpecials'
import { db } from '../../hooks/specialsTableStub'
import { weekStart } from '../../lib/mealPlan'

// The page's shape: one store, read by the card and by the planner beside it.
function Page() {
  const store = useSpecials()
  return (
    <>
      <SpecialsCard store={store} />
      <p data-testid="planner">{store.specials.map((s) => s.item).sort().join(',')}</p>
    </>
  )
}

async function scanOnePage(container: HTMLElement) {
  await waitFor(() => expect(screen.getByText('Re-scan flyer')).toBeTruthy())
  fireEvent.click(screen.getByText('Re-scan flyer'))
  const input = container.querySelector('input[type=file]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [new File(['fine'], 'p1.png', { type: 'image/png' })], configurable: true })
  await act(async () => { fireEvent.change(input) })
}

beforeEach(() => { db.reset([{ id: 'old-1', item: 'Salmon', week_range: weekStart(), source: 'scan' }]) })
afterEach(cleanup)

describe('SpecialsCard', () => {
  it('a new scan reaches the planner beside the card without a reload', async () => {
    const { container } = render(<Page />)
    await scanOnePage(container)
    await waitFor(() => expect(screen.getByTestId('planner').textContent).toBe('Chicken thighs'))
    expect(screen.queryByText('Take a photo of the flyer')).toBeNull() // scanner closed
  })

  it('a failed save is shown in the scanner, and "Try saving again" saves the same deals without another scan', async () => {
    db.fail.POST = true
    const { container } = render(<Page />)
    await scanOnePage(container)
    await waitFor(() => expect(screen.getByText(/last scan's deals are still here/)).toBeTruthy())
    expect(screen.getByTestId('planner').textContent).toBe('Salmon')
    db.fail = {}
    await act(async () => { fireEvent.click(screen.getByText('Try saving again')) })
    await waitFor(() => expect(screen.getByTestId('planner').textContent).toBe('Chicken thighs'))
    expect(screen.queryByText('Try saving again')).toBeNull()
    expect(db.rows.map((r) => r.item)).toEqual(['Chicken thighs'])
  })
})
