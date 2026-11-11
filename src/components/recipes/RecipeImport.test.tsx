// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import type { ImportedRecipe } from '../../lib/importRecipe'

const IMPORTED: ImportedRecipe = {
  title: 'Shrimp and Corn Chowder', description: 'NYT', prep_time: 20, cook_time: 35,
  ingredients: ['6 strips bacon', '1 pound shrimp', '1 (15.25-ounce) can whole kernel corn'],
  instructions: 'Render the bacon…', calories: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null,
  build: null, source_url: 'https://cooking.nytimes.com/recipes/1025304-shrimp-and-corn-chowder', image_url: null,
}
vi.mock('../../lib/importRecipe', () => ({
  importFromText: vi.fn(async () => IMPORTED), importFromUrl: vi.fn(), importFromImage: vi.fn(),
}))
import { RecipeImport } from './RecipeImport'

afterEach(cleanup)

async function importText() {
  fireEvent.change(screen.getByPlaceholderText(/Paste the recipe text/), { target: { value: 'Shrimp and Corn Chowder …' } })
  await act(async () => { fireEvent.click(screen.getByText('Import from text')) })
  await screen.findByText('Shrimp and Corn Chowder')
}

describe('RecipeImport.save', () => {
  it('a save the host could not complete shows an error and keeps the preview — never "Saved ✓"', async () => {
    const onSave = vi.fn(async () => false)
    render(<RecipeImport onSave={onSave} />)
    await importText()
    await act(async () => { fireEvent.click(screen.getByText(/^Save recipe$/)) })
    expect(screen.queryByText(/Saved ✓/)).toBeNull()
    expect(screen.getByText(/could not be saved/i)).toBeTruthy()
    expect(screen.getByText('Shrimp and Corn Chowder')).toBeTruthy()
    expect((screen.getByText(/^Save recipe$/) as HTMLButtonElement).disabled).toBe(false)
  })

  it('a host that throws leaves the form usable, not stuck busy', async () => {
    const onSave = vi.fn(async () => { throw new Error('TypeError: Failed to fetch') })
    render(<RecipeImport onSave={onSave} />)
    await importText()
    await act(async () => { fireEvent.click(screen.getByText(/^Save recipe$/)) })
    expect(screen.getByText(/Failed to fetch/)).toBeTruthy()
    expect((screen.getByText(/^Save recipe$/) as HTMLButtonElement).disabled).toBe(false)
  })

  it('a completed save shows "Saved ✓" and clears the preview', async () => {
    const onSave = vi.fn(async () => true)
    render(<RecipeImport onSave={onSave} />)
    await importText()
    await act(async () => { fireEvent.click(screen.getByText(/^Save recipe$/)) })
    expect(screen.getByText(/Saved ✓/)).toBeTruthy()
    expect(screen.queryByText('Shrimp and Corn Chowder')).toBeNull()
  })
})
