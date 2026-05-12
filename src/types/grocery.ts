export interface GroceryItem {
  id: string
  user_id: string
  name: string
  quantity: number
  unit: string
  category: string
  added_at: string
  is_checked: boolean
  checked_at: string | null
}
