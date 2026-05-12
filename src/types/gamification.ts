export type AchievementType =
  | 'first_cook'
  | 'week_warrior'
  | 'zero_waste_week'
  | 'freezer_archaeologist'
  | 'pantry_chef'
  | 'budget_boss'

export interface Achievement {
  id: string
  user_id: string
  type: AchievementType
  earned_at: string
  metadata: Record<string, unknown>
}

export interface CookingLog {
  id: string
  user_id: string
  recipe_id: string | null
  cooked_at: string
  estimated_cost_saved: number
  rating: number | null
  notes: string | null
}
