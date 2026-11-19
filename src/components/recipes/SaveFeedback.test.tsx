// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import type { InventoryItem } from '../../types/inventory'
import type { SpoonacularDetail } from '../../lib/spoonacular'

const DETAIL = {
  id: 7, title: 'Leek Soup', summary: 'Soup.', instructions: 'Simmer.', preparationMinutes: 5, cookingMinutes: 20, readyInMinutes: 25,
  extendedIngredients: [{ name: 'leek', amount: 2, unit: '' }],
} as unknown as SpoonacularDetail
const OTHER = { ...DETAIL, id: 8, title: 'Potato Gratin', instructions: 'Bake.' } as unknown as SpoonacularDetail
vi.mock('../../lib/spoonacular', () => ({ getRecipeDetail: async (id: number) => (id === 8 ? OTHER : DETAIL) }))
import { AiRecipeChat } from './AiRecipeChat'
import { RecipeDetail } from './RecipeDetail'

const GEN = {
  title: 'Chicken Bowl', description: '', prep_time: 10, cook_time: 20, instructions: 'Cook.',
  ingredients: [{ name: 'chicken', quantity: 1, unit: 'lb', base_ingredient: 'chicken' }],
}
const ITEMS = [{ id: 'i1', name: 'chicken' }] as unknown as InventoryItem[]
afterEach(cleanup)

async function generated(onSave: () => Promise<unknown>) {
  render(<AiRecipeChat inventoryItems={ITEMS} onGenerate={async () => GEN} onSave={onSave} onCook={vi.fn()} />)
  await act(async () => { fireEvent.click(screen.getByText('Generate Recipe')) })
  await screen.findByText('Chicken Bowl')
}

describe('saving a recipe says whether it landed', () => {
  it('AI Chef: a save that did not land says so and can be tried again', async () => {
    await generated(async () => undefined)
    await act(async () => { fireEvent.click(screen.getByText('Save')) })
    expect(screen.getByText(/Couldn’t save that recipe/)).toBeTruthy()
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(false)
  })

  it('AI Chef: a save that landed shows Saved and cannot be saved twice', async () => {
    const onSave = vi.fn(async () => ({ id: 'r1' }))
    await generated(onSave)
    await act(async () => { fireEvent.click(screen.getByText('Save')) })
    const btn = screen.getByText('Saved ✓') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(screen.queryByText(/Couldn’t save/)).toBeNull()
    fireEvent.click(btn)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('search result: a save that did not land says so', async () => {
    render(<RecipeDetail recipeId={7} onClose={vi.fn()} onSave={async () => undefined} onCook={vi.fn()} />)
    await screen.findByText('Simmer.')
    await act(async () => { fireEvent.click(screen.getByText('Save')) })
    expect(screen.getByText(/Couldn’t save that recipe/)).toBeTruthy()
  })

  it('search result: a save that landed shows Saved', async () => {
    render(<RecipeDetail recipeId={7} onClose={vi.fn()} onSave={async () => ({ id: 'r1' })} onCook={vi.fn()} />)
    await screen.findByText('Simmer.')
    await act(async () => { fireEvent.click(screen.getByText('Save')) })
    expect((screen.getByText('Saved ✓') as HTMLButtonElement).disabled).toBe(true)
  })

  // useRecipes.saveRecipe resolves with the row, or with undefined when the
  // user is signed out or either insert failed — the tests above pass exactly
  // those two shapes. These cover a save that throws, and a slow one.
  it('AI Chef: a save that throws is a failure, not a silent nothing', async () => {
    await generated(async () => { throw new Error('offline') })
    await act(async () => { fireEvent.click(screen.getByText('Save')) })
    expect(screen.getByText(/Couldn’t save that recipe/)).toBeTruthy()
  })

  it('search result: a save that throws is a failure', async () => {
    render(<RecipeDetail recipeId={7} onClose={vi.fn()} onSave={async () => { throw new Error('offline') }} onCook={vi.fn()} />)
    await screen.findByText('Simmer.')
    await act(async () => { fireEvent.click(screen.getByText('Save')) })
    expect(screen.getByText(/Couldn’t save that recipe/)).toBeTruthy()
    expect(screen.queryByText('Saved ✓')).toBeNull()
  })

  it('AI Chef: a slow save that lands after a new recipe was generated does not mark the new one saved', async () => {
    let land!: (row: unknown) => void
    const onSave = vi.fn(() => new Promise<unknown>((r) => { land = r }))
    const SECOND = { ...GEN, title: 'Tofu Bowl' }
    const onGenerate = vi.fn().mockResolvedValueOnce(GEN).mockResolvedValueOnce(SECOND)
    render(<AiRecipeChat inventoryItems={ITEMS} onGenerate={onGenerate} onSave={onSave} onCook={vi.fn()} />)
    await act(async () => { fireEvent.click(screen.getByText('Generate Recipe')) })
    await screen.findByText('Chicken Bowl')
    await act(async () => { fireEvent.click(screen.getByText('Save')) })
    expect(screen.getByText('Saving…')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByText('Generate Recipe')) })
    await screen.findByText('Tofu Bowl')
    await act(async () => { land({ id: 'r1' }) })
    expect(screen.queryByText('Saved ✓')).toBeNull()
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(false)
  })

  it('search result: a slow save that lands after another recipe was opened does not mark that one saved', async () => {
    let land!: (row: unknown) => void
    const onSave = vi.fn(() => new Promise<unknown>((r) => { land = r }))
    const { rerender } = render(<RecipeDetail recipeId={7} onClose={vi.fn()} onSave={onSave} onCook={vi.fn()} />)
    await screen.findByText('Simmer.')
    await act(async () => { fireEvent.click(screen.getByText('Save')) })
    expect(screen.getByText('Saving…')).toBeTruthy()
    rerender(<RecipeDetail recipeId={8} onClose={vi.fn()} onSave={onSave} onCook={vi.fn()} />)
    await screen.findByText('Bake.')
    await act(async () => { land({ id: 'r1' }) })
    expect(screen.queryByText('Saved ✓')).toBeNull()
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(false)
  })
})
