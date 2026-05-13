import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { InventoryItem, Category, Location, Unit, ItemStatus } from '../types/inventory'
import { getShelfLifeDays } from '../data/shelfLife'

interface AddItemInput {
  name: string
  category: Category
  location: Location
  quantity: number
  unit: Unit
  expiry_date?: string
  cost?: number
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
      const days = getShelfLifeDays(input.name, input.location)
      const date = new Date()
      date.setDate(date.getDate() + days)
      expiryDate = date.toISOString().split('T')[0]
      estimatedExpiry = true
    }

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

  return { items, allItems, loading, addItem, updateItem, updateStatus, deleteItem, deductQuantity, refetch: fetchItems }
}
