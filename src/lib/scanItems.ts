import type { Category, Location } from '../types/inventory'
import { CONTAINERS, type Container } from './container'

/** One reviewed row from a receipt scan, after normalisation. */
export interface ScannedItem {
  id: string
  name: string
  quantity: number
  /** What was paid for the row after promotions; null when unreadable. */
  cost: number | null
  unitPrice: number | null
  category: Category
  location: Location
  container: Container
}

export interface NormalizeResult {
  items: ScannedItem[]
  /** Rows the model emitted that were dropped (no name) or merged (duplicate). */
  dropped: number
  merged: number
}

const CATEGORIES: Category[] = ['produce', 'protein', 'dairy', 'grain', 'condiment', 'beverage', 'snack', 'other']
const LOCATIONS: Location[] = ['fridge', 'freezer', 'pantry']
const MAX_QUANTITY = 99
const MAX_MONEY = 10000

function money(x: unknown): number | null {
  if (typeof x === 'string') x = x.replace(/[$,\s]/g, '')
  const n = Number(x)
  if (!Number.isFinite(n) || n < 0 || n > MAX_MONEY) return null
  return Math.round(n * 100) / 100
}

function cleanName(x: unknown): string {
  if (typeof x !== 'string') return ''
  return x.replace(/[®™©]/g, '').replace(/\s+/g, ' ').trim()
}

function pick<T extends string>(x: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof x !== 'string') return fallback
  const v = x.toLowerCase().trim() as T
  return allowed.includes(v) ? v : fallback
}

/** Dedupe key: letters and digits only, so "Hoboken Farms Basil Marinara" == "HOBOKEN FARMS Basil Marinara, 25 OZ"-ish names still differ, but exact restatements collapse. */
export function dedupeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '')
}

let seq = 0
const nextId = () => `scan-${Date.now().toString(36)}-${(seq++).toString(36)}`

/**
 * Model JSON → typed rows. Every field is rebuilt (never spread), so unknown
 * keys and wrong types cannot reach React or the database. Rows without a
 * usable name are dropped; same-name rows are merged keeping the longer name
 * and the LARGER quantity (never the sum — overlapping screenshots repeat a
 * row, they do not add to it).
 */
export function normalizeScanItems(input: unknown): NormalizeResult {
  if (!Array.isArray(input)) return { items: [], dropped: 0, merged: 0 }
  const byKey = new Map<string, ScannedItem>()
  let dropped = 0
  let merged = 0
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { dropped++; continue }
    const r = raw as Record<string, unknown>
    const name = cleanName(r.name)
    if (!name) { dropped++; continue }

    const q = Number(r.quantity)
    const quantity = Number.isFinite(q) && q >= 1 ? Math.min(MAX_QUANTITY, Math.round(q)) : 1

    const unitPrice = money(r.unit_price)
    let cost = money(r.line_total)
    if (cost === null && unitPrice !== null) cost = Math.round(unitPrice * quantity * 100) / 100
    // A "total" above the undiscounted amount is a misread; fall back to unit × qty.
    if (cost !== null && unitPrice !== null && cost > unitPrice * quantity + 0.005) cost = Math.round(unitPrice * quantity * 100) / 100
    if (cost === null) cost = money(r.cost) // legacy single-field shape

    const item: ScannedItem = {
      id: nextId(),
      name,
      quantity,
      cost,
      unitPrice,
      category: pick(r.category, CATEGORIES, 'other'),
      location: pick(r.location, LOCATIONS, 'fridge'),
      container: pick(r.container, CONTAINERS, 'other'),
    }

    const key = dedupeKey(name)
    const prev = byKey.get(key)
    if (prev) {
      merged++
      byKey.set(key, {
        ...prev,
        name: item.name.length > prev.name.length ? item.name : prev.name,
        quantity: Math.max(prev.quantity, item.quantity),
        cost: prev.cost ?? item.cost,
        unitPrice: prev.unitPrice ?? item.unitPrice,
      })
    } else {
      byKey.set(key, item)
    }
  }
  return { items: [...byKey.values()], dropped, merged }
}
