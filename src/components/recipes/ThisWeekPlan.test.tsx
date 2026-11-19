// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import type { PlannedMeal } from '../../hooks/useMealPlan'
import type { RecipeWithIngredients } from '../../types/recipe'
import type { Preferences } from '../../types/preferences'
import { pickWeekFromArchive } from '../../lib/archivePlanner'
import { MEAL_SLOTS } from '../../lib/mealPlan'

// The meal-plan hook is the only Supabase seam the planner touches directly;
// everything else (constraints, hard-no check, protein rotation, consolidation)
// runs for real. `mp.meals` is mutable so a test can move the plan under an
// open shopping preview.
const mp = {
  week: '2026-11-09',
  meals: [] as PlannedMeal[],
  loading: false,
  loadFailed: false,
  reload: vi.fn(),
  syncWeek: vi.fn(() => '2026-11-09'),
  setSlot: vi.fn(async () => true),
  clearSlot: vi.fn(async () => true),
}
vi.mock('../../hooks/useMealPlan', () => ({ useMealPlan: () => mp }))
import { ThisWeekPlan } from './ThisWeekPlan'

// Production preference shape (PreferencesEditor defaults) with one hard no.
const prefs: Preferences = {
  dietary_restrictions: [], hard_nos: ['peanuts'], macro_targets: { protein_g: 120 },
  max_cook_minutes: 45, min_protein_types_per_week: 3, cuisine_variety: true, recency_weeks: 2,
}

function recipe(id: string, title: string, ings: string[], extra: Partial<RecipeWithIngredients> = {}): RecipeWithIngredients {
  return {
    id, user_id: 'u', title, description: '', instructions: '', prep_time: 10, cook_time: 20, source: 'manual',
    external_id: null, is_favorited: false, times_cooked: 0, calories: null, protein_g: null, carbs_g: null,
    fat_g: null, fiber_g: null, last_cooked_at: null, heart_count: 0, image_url: null, source_url: null,
    steps: null, build: null, servings: null, cost_per_serving: 4, cost_estimated_at: null,
    recipe_ingredients: ings.map((name, i) => ({ id: `${id}-${i}`, recipe_id: id, name, quantity: 1, unit: '', is_optional: false })),
    ...extra,
  }
}
const meal = (slot: number, r: RecipeWithIngredients): PlannedMeal => ({ id: `m${slot}`, meal_type: MEAL_SLOTS[slot].meal_type, slot_order: slot, recipe: r })

// A generated candidate as claude.ts returns it (no id — nothing is saved yet).
const gen = (title: string, names: string[]) => ({
  title, description: '', prep_time: 10, cook_time: 20, instructions: '',
  ingredients: names.map((name) => ({ name, quantity: 1, unit: '', base_ingredient: name })),
})
const SAFE = ['chicken thighs', 'rice', 'broccoli']

function renderPlan(over: Partial<Parameters<typeof ThisWeekPlan>[0]> = {}) {
  const props = {
    savedRecipes: [] as RecipeWithIngredients[], inventoryItems: [], preferences: prefs, specials: [],
    onGenerateForSlot: vi.fn(async () => gen('Chicken Bowl', SAFE)),
    onPersistSlotRecipe: vi.fn(async (g: { title: string }) => `id-${g.title}`),
    onEnsureEconomics: vi.fn(async () => ({ servings: 2, cost_per_serving: 4 })),
    onAddToGrocery: vi.fn(async () => {}),
    onViewRecipe: vi.fn(),
    ...over,
  }
  const utils = render(<ThisWeekPlan {...props} />)
  return { ...utils, props, persist: props.onPersistSlotRecipe as Mock }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => {
  mp.meals = []
  mp.loadFailed = false
  mp.reload.mockClear(); mp.syncWeek.mockReset(); mp.syncWeek.mockReturnValue('2026-11-09')
  mp.setSlot.mockClear(); mp.clearSlot.mockClear()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('ThisWeekPlan — week planning state machine', () => {
  it('a failed generation does not wedge the planner: the plan button comes back and the note counts the slot', async () => {
    const onGenerateForSlot = vi.fn()
      .mockResolvedValueOnce(gen('Breakfast Bowl', ['eggs', 'toast']))
      .mockRejectedValueOnce(new Error('Recipe generation failed: 500'))
      .mockResolvedValueOnce(gen('Dinner One', ['salmon', 'rice']))
      .mockResolvedValueOnce(gen('Dinner Two', ['tofu', 'noodles']))
    const { props } = renderPlan({ onGenerateForSlot })
    await act(async () => { fireEvent.click(screen.getByText(/Plan my week from deals/)) })
    await screen.findByText(/Plan my week from deals/)
    expect(screen.queryByText(/Planning/)).toBeNull()
    expect(screen.getByText(/Couldn’t plan 1 slot/)).toBeTruthy()
    expect(props.onPersistSlotRecipe).toHaveBeenCalledTimes(3)
    expect(mp.setSlot).toHaveBeenCalledTimes(3)
  })

  it('a candidate that breaks a hard no is never persisted; only the accepted retry is saved', async () => {
    const onGenerateForSlot = vi.fn()
      .mockResolvedValueOnce(gen('Satay', ['chicken', 'peanuts']))
      .mockResolvedValue(gen('Chicken Bowl', SAFE))
    const { persist } = renderPlan({ onGenerateForSlot })
    await act(async () => { fireEvent.click(screen.getByText(/Plan my week from deals/)) })
    await screen.findByText(/Plan my week from deals/)
    const persisted = persist.mock.calls.map((c: unknown[]) => (c[0] as { title: string }).title)
    expect(persisted).not.toContain('Satay')
    expect(persisted.length).toBe(mp.setSlot.mock.calls.length)
    expect(persisted.length).toBeGreaterThan(0)
    // the rejected attempt was asked for, then retried with the firmer constraint
    expect(onGenerateForSlot.mock.calls[1][0].constraints.join(' ')).toMatch(/peanuts/)
  })

  it('Cancel during a pending generation persists nothing and writes no slot', async () => {
    const d = deferred<ReturnType<typeof gen>>()
    const onGenerateForSlot = vi.fn(() => d.promise)
    const { props } = renderPlan({ onGenerateForSlot })
    await act(async () => { fireEvent.click(screen.getByText(/Plan my week from deals/)) })
    await screen.findByText(/Planning breakfast/)
    await act(async () => { fireEvent.click(screen.getByText('Cancel')) })
    await act(async () => { d.resolve(gen('Chicken Bowl', SAFE)) })
    await screen.findByText(/Plan my week from deals/)
    expect(props.onPersistSlotRecipe).not.toHaveBeenCalled()
    expect(mp.setSlot).not.toHaveBeenCalled()
    expect(onGenerateForSlot).toHaveBeenCalledTimes(1)
  })

  it('a double tap on "Plan from my recipes" runs one fill, not two interleaved ones', async () => {
    const savedRecipes = [
      recipe('a', 'Oats', ['oats', 'milk']), recipe('b', 'Chicken Salad', ['chicken', 'lettuce']),
      recipe('c', 'Salmon Rice', ['salmon', 'rice']), recipe('d', 'Tofu Stir Fry', ['tofu', 'rice']),
    ]
    const { picks } = pickWeekFromArchive(savedRecipes, prefs, MEAL_SLOTS)
    expect(picks.length).toBeGreaterThan(0)
    renderPlan({ savedRecipes })
    const btn = screen.getByText(/Plan from my recipes/)
    await act(async () => { fireEvent.click(btn); fireEvent.click(btn) })
    await waitFor(() => expect(mp.setSlot).toHaveBeenCalledTimes(picks.length))
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(mp.setSlot).toHaveBeenCalledTimes(picks.length)
  })

  it('a failed swap clears the spinner and re-enables the swap button', async () => {
    mp.meals = [meal(0, recipe('a', 'Oats', ['oats']))]
    const onGenerateForSlot = vi.fn().mockRejectedValue(new Error('Recipe generation failed: 500'))
    renderPlan({ onGenerateForSlot })
    await act(async () => { fireEvent.click(screen.getByTitle('Swap this meal')) })
    await screen.findByText(/Couldn’t find a different meal/)
    expect(screen.queryByText(/Finding a different/)).toBeNull()
    expect((screen.getByTitle('Swap this meal') as HTMLButtonElement).disabled).toBe(false)
  })

  it('unmounting mid-plan stops the loop: no further generations or slot writes', async () => {
    const d = deferred<ReturnType<typeof gen>>()
    const onGenerateForSlot = vi.fn().mockReturnValueOnce(d.promise).mockResolvedValue(gen('Chicken Bowl', SAFE))
    const { unmount, props } = renderPlan({ onGenerateForSlot })
    await act(async () => { fireEvent.click(screen.getByText(/Plan my week from deals/)) })
    await screen.findByText(/Planning breakfast/)
    unmount()
    await act(async () => { d.resolve(gen('Breakfast Bowl', ['eggs'])) })
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(onGenerateForSlot).toHaveBeenCalledTimes(1)
    expect(props.onPersistSlotRecipe).not.toHaveBeenCalled()
    expect(mp.setSlot).not.toHaveBeenCalled()
  })

  it('unmounting during an archive fill stops the remaining slot writes', async () => {
    const savedRecipes = [
      recipe('a', 'Oats', ['oats', 'milk']), recipe('b', 'Chicken Salad', ['chicken', 'lettuce']),
      recipe('c', 'Salmon Rice', ['salmon', 'rice']), recipe('d', 'Tofu Stir Fry', ['tofu', 'rice']),
    ]
    const { picks } = pickWeekFromArchive(savedRecipes, prefs, MEAL_SLOTS)
    expect(picks.length).toBeGreaterThan(1)
    const first = deferred<boolean>()
    mp.setSlot.mockReturnValueOnce(first.promise)
    const { unmount } = renderPlan({ savedRecipes })
    await act(async () => { fireEvent.click(screen.getByText(/Plan from my recipes/)) })
    expect(mp.setSlot).toHaveBeenCalledTimes(1)
    unmount()
    await act(async () => { first.resolve(true) })
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(mp.setSlot).toHaveBeenCalledTimes(1)
  })

  it('a slot write that does not land during an archive fill is reported after the unfilled note, not silent', async () => {
    const savedRecipes = [recipe('a', 'Oats', ['oats', 'milk']), recipe('b', 'Chicken Salad', ['chicken', 'lettuce'])]
    const { picks, unfilledSlots } = pickWeekFromArchive(savedRecipes, prefs, MEAL_SLOTS)
    expect(unfilledSlots.length).toBeGreaterThan(0)
    const labels = unfilledSlots.map((i) => MEAL_SLOTS[i].label.toLowerCase()).join(', ')
    mp.setSlot.mockResolvedValue(false)
    renderPlan({ savedRecipes })
    await act(async () => { fireEvent.click(screen.getByText(/Plan from my recipes/)) })
    const plural = picks.length > 1 ? 's' : ''
    await screen.findByText(`Couldn’t fill ${labels} from your saved recipes — add one manually or import more. ${picks.length} meal${plural} could not be saved — try again.`)
    expect((screen.getByText(/Plan from my recipes/) as HTMLButtonElement).disabled).toBe(false)
  })

  it('with unfilled slots and every write landing, only the unfilled sentence shows', async () => {
    const savedRecipes = [recipe('a', 'Oats', ['oats', 'milk'])]
    const { unfilledSlots } = pickWeekFromArchive(savedRecipes, prefs, MEAL_SLOTS)
    expect(unfilledSlots.length).toBeGreaterThan(0)
    const labels = unfilledSlots.map((i) => MEAL_SLOTS[i].label.toLowerCase()).join(', ')
    renderPlan({ savedRecipes })
    await act(async () => { fireEvent.click(screen.getByText(/Plan from my recipes/)) })
    await screen.findByText(`Couldn’t fill ${labels} from your saved recipes — add one manually or import more.`)
    expect(screen.queryByText(/could not be saved/)).toBeNull()
  })

  it('unmounting while the archive fill is clearing unfilled slots stops the remaining clears and every slot write', async () => {
    const savedRecipes = [recipe('a', 'Oats', ['oats', 'milk'])]
    const { picks, unfilledSlots } = pickWeekFromArchive(savedRecipes, prefs, MEAL_SLOTS)
    expect(unfilledSlots.length).toBeGreaterThan(1)
    expect(picks.length).toBeGreaterThan(0)
    const first = deferred<boolean>()
    mp.clearSlot.mockReturnValueOnce(first.promise)
    const { unmount } = renderPlan({ savedRecipes })
    await act(async () => { fireEvent.click(screen.getByText(/Plan from my recipes/)) })
    expect(mp.clearSlot).toHaveBeenCalledTimes(1)
    unmount()
    await act(async () => { first.resolve(true) })
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(mp.clearSlot).toHaveBeenCalledTimes(1)
    expect(mp.setSlot).not.toHaveBeenCalled()
  })

  it('a manual picker that was open when a plan starts cannot write a slot under the run', async () => {
    mp.meals = []
    const savedRecipes = [recipe('a', 'Oats', ['oats', 'milk'])]
    const d = deferred<ReturnType<typeof gen>>()
    const onGenerateForSlot = vi.fn(() => d.promise)
    renderPlan({ savedRecipes, onGenerateForSlot })
    await act(async () => { fireEvent.click(screen.getAllByText(/Add dinner manually/)[0]) })
    expect(screen.getByText('Oats')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByText(/Plan my week from deals/)) })
    await screen.findByText(/Planning breakfast/)
    const pick = screen.queryByText('Oats')
    if (pick) await act(async () => { fireEvent.click(pick) })
    expect(mp.setSlot).not.toHaveBeenCalled()
    await act(async () => { d.resolve(gen('Chicken Bowl', SAFE)) })
  })

  it('the shopping preview follows the plan instead of a snapshot taken when it opened', async () => {
    mp.meals = [meal(0, recipe('a', 'Oats', ['oats', 'milk'])), meal(2, recipe('c', 'Salmon Rice', ['salmon', 'rice']))]
    const { rerender, props } = renderPlan()
    await act(async () => { fireEvent.click(screen.getByText(/Build shopping list from plan/)) })
    await screen.findByText(/Shopping list — 4 to buy/)
    mp.meals = [meal(0, recipe('a', 'Oats', ['oats', 'milk']))]
    rerender(<ThisWeekPlan {...props} />)
    await screen.findByText(/Shopping list — 2 to buy/)
    expect(screen.queryByText(/salmon/)).toBeNull()
  })

  it('keeps the screen awake while a plan is generating and lets it sleep after', async () => {
    const release = vi.fn(async () => {})
    const request = vi.fn(async () => ({ release, addEventListener() {} }))
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    try {
      const d = deferred<ReturnType<typeof gen>>()
      renderPlan({ onGenerateForSlot: vi.fn(() => d.promise) })
      expect(request).not.toHaveBeenCalled()
      await act(async () => { fireEvent.click(screen.getByText(/Plan my week from deals/)) })
      await screen.findByText(/Planning breakfast/)
      expect(request).toHaveBeenCalledWith('screen')
      expect(release).not.toHaveBeenCalled()
      await act(async () => { fireEvent.click(screen.getByText('Cancel')) })
      await act(async () => { d.resolve(gen('Chicken Bowl', SAFE)) })
      await screen.findByText(/Plan my week from deals/)
      await waitFor(() => expect(release).toHaveBeenCalledTimes(1))
    } finally {
      delete (navigator as unknown as { wakeLock?: unknown }).wakeLock
    }
  })

  it('"Fill the empty slots" picks an interrupted plan back up: kept meals stay, count toward variety, and nothing asks to replace them', async () => {
    mp.meals = [meal(0, recipe('a', 'Oats', ['oats', 'milk'])), meal(2, recipe('c', 'Chicken Rice', ['chicken thighs', 'rice']))]
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onGenerateForSlot = vi.fn()
      .mockResolvedValueOnce(gen('Chicken Bowl', SAFE)) // chicken is already in the week → rejected
      .mockResolvedValueOnce(gen('Salmon Plate', ['salmon', 'greens']))
      .mockResolvedValueOnce(gen('Tofu Noodles', ['tofu', 'noodles']))
    const { persist } = renderPlan({ onGenerateForSlot })
    await act(async () => { fireEvent.click(screen.getByText(/Fill the 2 empty slots from deals/)) })
    await screen.findByText(/Replan my week from deals/)
    expect(confirm).not.toHaveBeenCalled()
    expect(mp.setSlot.mock.calls.map((c: unknown[]) => c[2])).toEqual([1, 3])
    expect(mp.clearSlot).not.toHaveBeenCalled()
    expect(persist.mock.calls.map((c: unknown[]) => (c[0] as { title: string }).title)).toEqual(['Salmon Plate', 'Tofu Noodles'])
    expect(onGenerateForSlot.mock.calls[0][0].constraints.join(' ')).toMatch(/Oats; Chicken Rice/)
  })

  it('offers "Fill the empty slots" only for a part-filled week', async () => {
    renderPlan()
    expect(screen.queryByText(/Fill the/)).toBeNull()
    cleanup()
    mp.meals = MEAL_SLOTS.map((_, i) => meal(i, recipe(`r${i}`, `Meal ${i}`, ['rice'])))
    renderPlan()
    expect(screen.queryByText(/Fill the/)).toBeNull()
  })

  it('a screen still showing last week does not plan: the first tap only moves to the new week', async () => {
    mp.meals = [meal(0, recipe('a', 'Oats', ['oats']))]
    mp.syncWeek.mockReturnValue('2026-11-16') // the calendar has moved on; this render is still 11-09
    const { props } = renderPlan()
    for (const label of [/Replan my week from deals/, /Fill the 3 empty slots/, /Replan from my recipes/]) {
      await act(async () => { fireEvent.click(screen.getByText(label)) })
    }
    await act(async () => { fireEvent.click(screen.getByTitle('Swap this meal')) })
    expect(screen.getByText(/A new week has started/)).toBeTruthy()
    expect(window.confirm).not.toHaveBeenCalled()
    expect(props.onGenerateForSlot).not.toHaveBeenCalled()
    expect(mp.setSlot).not.toHaveBeenCalled()
    expect(mp.clearSlot).not.toHaveBeenCalled()
  })

  it('every slot a plan writes is pinned to the week the plan started in', async () => {
    renderPlan()
    await act(async () => { fireEvent.click(screen.getByText(/Plan my week from deals/)) })
    await screen.findByText(/Plan my week from deals/)
    expect(mp.setSlot.mock.calls.length).toBeGreaterThan(0)
    expect(mp.setSlot.mock.calls.map((c: unknown[]) => c[3])).toEqual(mp.setSlot.mock.calls.map(() => '2026-11-09'))
  })

  it('a plan that the week changed under says so instead of blaming the slots', async () => {
    mp.syncWeek.mockReturnValueOnce('2026-11-09').mockReturnValue('2026-11-16') // same week at the tap, a new one by the end
    mp.setSlot.mockResolvedValue(false)
    try {
      renderPlan()
      await act(async () => { fireEvent.click(screen.getByText(/Plan my week from deals/)) })
      await screen.findByText(/The week changed while planning/)
      expect(screen.queryByText(/Couldn’t plan/)).toBeNull()
    } finally {
      mp.setSlot.mockResolvedValue(true)
    }
  })

  it('a week that failed to load offers Try again and no way to plan over it', async () => {
    mp.loadFailed = true
    renderPlan()
    expect(screen.getByText(/Couldn’t load this week’s plan/)).toBeTruthy()
    expect(screen.queryByText(/Plan my week from deals/)).toBeNull()
    expect(screen.queryByText(/Plan from my recipes/)).toBeNull()
    fireEvent.click(screen.getByText('Try again'))
    expect(mp.reload).toHaveBeenCalledTimes(1)
  })

  it('an archive fill and a swap pin their writes to the week they started in', async () => {
    const savedRecipes = [
      recipe('a', 'Oats', ['oats', 'milk']), recipe('b', 'Chicken Salad', ['chicken', 'lettuce']),
      recipe('c', 'Salmon Rice', ['salmon', 'rice']), recipe('d', 'Tofu Stir Fry', ['tofu', 'rice']),
    ]
    const { picks } = pickWeekFromArchive(savedRecipes, prefs, MEAL_SLOTS)
    expect(picks.length).toBeGreaterThan(0)
    renderPlan({ savedRecipes })
    await act(async () => { fireEvent.click(screen.getByText(/Plan from my recipes/)) })
    await waitFor(() => expect(mp.setSlot).toHaveBeenCalledTimes(picks.length))
    expect(mp.setSlot.mock.calls.map((c: unknown[]) => c[3])).toEqual(picks.map(() => '2026-11-09'))
    cleanup(); mp.setSlot.mockClear()

    mp.meals = [meal(0, recipe('a', 'Oats', ['oats']))]
    renderPlan({ onGenerateForSlot: vi.fn(async () => gen('Egg Toast', ['eggs', 'bread'])) })
    await act(async () => { fireEvent.click(screen.getByTitle('Swap this meal')) })
    await waitFor(() => expect(mp.setSlot).toHaveBeenCalledTimes(1))
    expect((mp.setSlot.mock.calls[0] as unknown[])[3]).toBe('2026-11-09')
  })
})
