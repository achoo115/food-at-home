import type { AchievementType } from '../types/gamification'

export interface AchievementDefinition {
  type: AchievementType
  name: string
  description: string
  icon: string
}

export const achievementDefinitions: AchievementDefinition[] = [
  { type: 'first_cook', name: 'First Cook', description: 'Log your first meal', icon: '🍳' },
  { type: 'week_warrior', name: 'Week Warrior', description: 'Cook 7 days in a row', icon: '⚔️' },
  { type: 'zero_waste_week', name: 'Zero Waste Week', description: 'No items expired in a week', icon: '♻️' },
  { type: 'freezer_archaeologist', name: 'Freezer Archaeologist', description: 'Use an item from the freezer older than 3 months', icon: '🦴' },
  { type: 'pantry_chef', name: 'Pantry Chef', description: 'Cook a meal using only what you had on hand', icon: '🏆' },
  { type: 'budget_boss', name: 'Budget Boss', description: 'Save $100+ vs takeout in a month', icon: '💰' },
]
