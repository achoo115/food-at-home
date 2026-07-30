import { useNavigate } from 'react-router-dom'
import { useInventory } from '../hooks/useInventory'
import { useCookingLog } from '../hooks/useCookingLog'
import { useToday } from '../hooks/useToday'
import { daysUntilExpiry } from '../lib/expiry'
import { ExpiryAlerts } from '../components/dashboard/ExpiryAlerts'
import { StreakDisplay } from '../components/dashboard/StreakDisplay'
import { SavingsSnapshot } from '../components/dashboard/SavingsSnapshot'
import { RecipeSuggestion } from '../components/dashboard/RecipeSuggestion'

export function DashboardPage() {
  const { items } = useInventory()
  const cookingLog = useCookingLog()
  const navigate = useNavigate()
  const today = useToday()

  const expiringItems = items.filter((i) => {
    if (i.status !== 'active') return false
    const days = daysUntilExpiry(i.expiry_date, today)
    return days !== null && days <= 3
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Food at Home</h1>
      <StreakDisplay streak={cookingLog.getCurrentStreak()} weeklyCooks={cookingLog.getWeeklyCookCount()} />
      <SavingsSnapshot monthlySavings={cookingLog.getMonthlySavings()} />
      <ExpiryAlerts items={items} />
      <RecipeSuggestion expiringItems={expiringItems} onViewRecipes={() => navigate('/recipes')} />
    </div>
  )
}
