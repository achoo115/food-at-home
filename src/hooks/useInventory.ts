import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { InventoryItem, Category, Location, Unit, ItemStatus, Container } from '../types/inventory'
import { getShelfLifeDays, getOpenedShelfLifeDays } from '../data/shelfLife'
import { inferContainer } from '../lib/container'

interface AddItemInput {
  name: string
  category: Category
  location: Location
  quantity: number
  unit: Unit
  expiry_date?: string
  cost?: number
  container?: Container | null
}

/** YYYY-MM-DD, `days` from now in local time. */
export function dateAfterDays(days: number, now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function useInventory() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [allItems, setAllItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('status', 'active')
      .order('expiry_date', { ascending: true })
    if (!error && data) setItems(data)
    setLoading(false)
  }, [])

  const fetchAllItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .order('expiry_date', { ascending: true })
    if (!error && data) setAllItems(data)
  }, [])

  useEffect(() => {
    fetchItems()
    fetchAllItems()
  }, [fetchItems, fetchAllItems])

  async function addItem(input: AddItemInput) {
    let expiryDate = input.expiry_date
    let estimatedExpiry = false

    if (!expiryDate) {
      expiryDate = dateAfterDays(getShelfLifeDays(input.name, input.location))
      estimatedExpiry = true
    }
    const container = input.container ?? inferContainer(input.name)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('inventory_items')
      .insert({
        user_id: user.id,
        name: input.name,
        category: input.category,
        location: input.location,
        quantity: input.quantity,
        unit: input.unit,
        expiry_date: expiryDate,
        estimated_expiry: estimatedExpiry,
        cost: input.cost ?? null,
        container,
      })
      .select()
      .single()

    if (!error && data) {
      setItems((prev) => [...prev, data].sort(
        (a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
      ))
    }
    return { data, error }
  }

  async function updateItem(id: string, updates: Partial<InventoryItem>) {
    const { data, error } = await supabase
      .from('inventory_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (!error && data) {
      setItems((prev) => prev.map((item) => (item.id === id ? data : item)))
    }
    return { data, error }
  }

  async function updateStatus(id: string, status: ItemStatus) {
    const result = await updateItem(id, { status })
    // Remove from local active list when no longer active
    if (status !== 'active') {
      setItems((prev) => prev.filter((item) => item.id !== id))
    }
    return result
  }

  /**
   * Mark a sealed item opened: records the date and resets the expiry to the
   * opened shelf life (a can of beans: 2 years sealed, 3 days opened). Only
   * meaningful for sealed containers; the card hides the control otherwise.
   */
  async function markOpened(id: string) {
    const item = items.find((i) => i.id === id)
    if (!item) return
    const today = dateAfterDays(0)
    return updateItem(id, {
      opened_at: today,
      expiry_date: dateAfterDays(getOpenedShelfLifeDays(item.name, item.location)),
      estimated_expiry: true,
    })
  }

  async function deleteItem(id: string) {
    const { error } = await supabase
      .from('inventory_items')
      .delete()
      .eq('id', id)

    if (!error) {
      setItems((prev) => prev.filter((item) => item.id !== id))
    }
  }

  async function deductQuantity(id: string, amount: number) {
    const item = items.find((i) => i.id === id)
    if (!item) return
    const newQty = item.quantity - amount
    if (newQty <= 0) {
      return updateStatus(id, 'consumed')
    }
    return updateItem(id, { quantity: newQty })
  }

  return { items, allItems, loading, addItem, updateItem, updateStatus, markOpened, deleteItem, deductQuantity, refetch: fetchItems }
}
