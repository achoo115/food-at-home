export type Category = 'produce' | 'protein' | 'dairy' | 'grain' | 'condiment' | 'beverage' | 'snack' | 'other'
export type Location = 'fridge' | 'freezer' | 'pantry'
export type Unit = 'count' | 'oz' | 'lb' | 'g' | 'kg' | 'ml' | 'l' | 'cup' | 'tbsp' | 'tsp'
export type ItemStatus = 'active' | 'consumed' | 'expired' | 'wasted'

export interface InventoryItem {
  id: string
  user_id: string
  name: string
  category: Category
  location: Location
  quantity: number
  unit: Unit
  added_at: string
  expiry_date: string
  estimated_expiry: boolean
  status: ItemStatus
  cost: number | null
}
