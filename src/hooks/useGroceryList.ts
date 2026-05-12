import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { GroceryItem } from '../types/grocery'

export function useGroceryList() {
  const [items, setItems] = useState<GroceryItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('grocery_list')
      .select('*')
      .order('added_at', { ascending: false })
    if (!error && data) setItems(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function addItem(name: string, quantity: number = 1, unit: string = 'count', category: string = '') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('grocery_list')
      .insert({ user_id: user.id, name, quantity, unit, category })
      .select()
      .single()

    if (!error && data) setItems((prev) => [data, ...prev])
  }

  async function toggleCheck(id: string, checked: boolean) {
    const updates = checked
      ? { is_checked: true, checked_at: new Date().toISOString() }
      : { is_checked: false, checked_at: null }

    const { error } = await supabase.from('grocery_list').update(updates).eq('id', id)
    if (!error) {
      setItems((prev) => prev.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ))
    }
  }

  async function deleteItem(id: string) {
    const { error } = await supabase.from('grocery_list').delete().eq('id', id)
    if (!error) setItems((prev) => prev.filter((item) => item.id !== id))
  }

  async function clearChecked() {
    const checkedIds = items.filter((i) => i.is_checked).map((i) => i.id)
    if (checkedIds.length === 0) return

    const { error } = await supabase.from('grocery_list').delete().in('id', checkedIds)
    if (!error) setItems((prev) => prev.filter((item) => !item.is_checked))
  }

  const checkedItems = items.filter((i) => i.is_checked)
  const uncheckedItems = items.filter((i) => !i.is_checked)

  return { items, checkedItems, uncheckedItems, loading, addItem, toggleCheck, deleteItem, clearChecked, refetch: fetchItems }
}
