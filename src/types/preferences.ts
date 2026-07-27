export interface MacroTargets {
  calories?: number
  protein_g?: number
  fiber_g?: number
}

// Per-user household preferences — the source of truth the AI planner reads.
export interface Preferences {
  id?: string
  user_id?: string
  dietary_restrictions: string[]
  hard_nos: string[]
  macro_targets: MacroTargets
  max_cook_minutes: number | null
  min_protein_types_per_week: number
  cuisine_variety: boolean
  recency_weeks: number
}
