// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { DEFAULT_PREFERENCES } from '../lib/preferences'

// The page wires each Save button to useRecipes.saveRecipe, which resolves
// with the saved row, or with undefined on every failure path (signed out,
// recipe insert failed, ingredients insert failed). The buttons are real; only
// the data hooks and the two heavy week cards are replaced.
const saveRecipe = vi.fn()
const GEN = {
  title: 'Chicken Bowl', description: '', prep_time: 10, cook_time: 20, instructions: 'Cook.',
  ingredients: [{ name: 'chicken', quantity: 1, unit: 'lb', base_ingredient: 'chicken' }],
}
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../hooks/useRecipes', () => ({
  useRecipes: () => ({
    savedRecipes: [], searching: false, saveRecipe,
    searchResults: [{ id: 7, title: 'Leek Soup', image: '', usedIngredientCount: 1, missedIngredientCount: 0, missedIngredients: [] }],
    searchByInventory: vi.fn(), generateAiRecipe: async () => GEN, toggleFavorite: vi.fn(), incrementCookCount: vi.fn(), ensureEconomics: vi.fn(),
  }),
}))
vi.mock('../hooks/useInventory', () => ({ useInventory: () => ({ items: [{ id: 'i1', name: 'chicken', expiry_date: null }], deductQuantity: vi.fn() }) }))
vi.mock('../hooks/useCookingLog', () => ({ useCookingLog: () => ({ logCook: vi.fn() }) }))
vi.mock('../hooks/usePreferences', () => ({ usePreferences: () => ({ preferences: DEFAULT_PREFERENCES }) }))
vi.mock('../hooks/useGroceryList', () => ({ useGroceryList: () => ({ addItem: vi.fn() }) }))
vi.mock('../hooks/useSpecials', () => ({ useSpecials: () => ({ specials: [] }) }))
vi.mock('../components/recipes/ThisWeekPlan', () => ({ ThisWeekPlan: () => null }))
vi.mock('../components/recipes/SpecialsCard', () => ({ SpecialsCard: () => null }))
vi.mock('../lib/spoonacular', () => ({
  getRecipeDetail: async () => ({
    id: 7, title: 'Leek Soup', summary: 'Soup.', instructions: 'Simmer.', preparationMinutes: 5, cookingMinutes: 20, readyInMinutes: 25,
    extendedIngredients: [{ name: 'leek', amount: 2, unit: '' }],
  }),
}))
import { RecipesPage } from './RecipesPage'

beforeEach(() => { saveRecipe.mockReset() })
afterEach(cleanup)

async function aiChefSave() {
  render(<RecipesPage />)
  fireEvent.click(screen.getByText('AI Chef'))
  await act(async () => { fireEvent.click(screen.getByText('Generate Recipe')) })
  await screen.findByText('Chicken Bowl')
  await act(async () => { fireEvent.click(screen.getByText('Save')) })
}
async function searchResultSave() {
  render(<RecipesPage />)
  fireEvent.click(screen.getByText('Make?'))
  fireEvent.click(screen.getByText('Leek Soup'))
  await screen.findByText('Simmer.')
  await act(async () => { fireEvent.click(screen.getByText('Save')) })
}

describe('RecipesPage — Save reports what saveRecipe did', () => {
  it('AI Chef: saved row → Saved', async () => {
    saveRecipe.mockResolvedValue({ id: 'r1' })
    await aiChefSave()
    expect(saveRecipe).toHaveBeenCalledTimes(1)
    expect(saveRecipe.mock.calls[0][0]).toMatchObject({ title: 'Chicken Bowl', source: 'ai_generated', ingredients: [{ name: 'chicken', quantity: 1, unit: 'lb' }] })
    expect(screen.getByText('Saved ✓')).toBeTruthy()
  })

  it('AI Chef: nothing saved → says so', async () => {
    saveRecipe.mockResolvedValue(undefined)
    await aiChefSave()
    expect(screen.getByText(/Couldn’t save that recipe/)).toBeTruthy()
    expect(screen.queryByText('Saved ✓')).toBeNull()
  })

  it('search result: saved row → Saved', async () => {
    saveRecipe.mockResolvedValue({ id: 'r2' })
    await searchResultSave()
    expect(saveRecipe.mock.calls[0][0]).toMatchObject({ title: 'Leek Soup', source: 'api', external_id: '7' })
    expect(screen.getByText('Saved ✓')).toBeTruthy()
  })

  it('search result: nothing saved → says so', async () => {
    saveRecipe.mockResolvedValue(undefined)
    await searchResultSave()
    expect(screen.getByText(/Couldn’t save that recipe/)).toBeTruthy()
    expect(screen.queryByText('Saved ✓')).toBeNull()
  })
})
