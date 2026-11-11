// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

type Result = { data: unknown; error: { message: string } | null }
const calls: { table: string; op: string; args: unknown[] }[] = []
const results: Record<string, Result> = {}
function builder(table: string, op: string) {
  const b: Record<string, unknown> = {}
  const chain = (name: string) => (...args: unknown[]) => { calls.push({ table, op: `${op}.${name}`, args }); return b }
  for (const n of ['eq', 'order', 'select', 'single']) b[n] = chain(n)
  b.then = (res: (r: Result) => void) => res(results[`${table}.${op}`] ?? { data: null, error: null })
  return b
}
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => Object.fromEntries(['select', 'insert', 'delete', 'update'].map((op) =>
      [op, (...a: unknown[]) => { calls.push({ table, op, args: a }); return builder(table, op) }])),
  },
}))
import { useRecipes } from './useRecipes'

const RECIPE = { title: 'Chicken Bowl', description: '', instructions: '', prep_time: 10, cook_time: 20, source: 'ai_generated' as const,
  ingredients: [{ name: 'chicken thighs', quantity: 1, unit: 'lb' }, { name: 'rice', quantity: 2, unit: 'cup' }] }

beforeEach(() => {
  calls.length = 0
  for (const k of Object.keys(results)) delete results[k]
  results['recipes.select'] = { data: [], error: null }
  results['recipes.insert'] = { data: { id: 'r1', title: 'Chicken Bowl' }, error: null }
})

describe('useRecipes.saveRecipe', () => {
  it('fails closed: when the ingredients insert fails it removes the recipe row and returns nothing', async () => {
    results['recipe_ingredients.insert'] = { data: null, error: { message: 'TypeError: Failed to fetch' } }
    const { result } = renderHook(() => useRecipes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    let saved: unknown = 'unset'
    await act(async () => { saved = await result.current.saveRecipe(RECIPE) })
    expect(saved).toBeUndefined()
    const del = calls.find((c) => c.table === 'recipes' && c.op === 'delete')
    expect(del).toBeTruthy()
    const delEq = calls.find((c) => c.table === 'recipes' && c.op === 'delete.eq')
    expect(delEq?.args).toEqual(['id', 'r1'])
  })

  it('returns the recipe when both inserts succeed, with no delete', async () => {
    results['recipe_ingredients.insert'] = { data: [{}, {}], error: null }
    const { result } = renderHook(() => useRecipes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    let saved: { id: string } | undefined
    await act(async () => { saved = await result.current.saveRecipe(RECIPE) })
    expect(saved?.id).toBe('r1')
    expect(calls.find((c) => c.table === 'recipes' && c.op === 'delete')).toBeUndefined()
  })
})
