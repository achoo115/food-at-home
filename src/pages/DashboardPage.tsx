import { useNavigate } from 'react-router-dom'
import { useInventory } from '../hooks/useInventory'
import { useCookingLog } from '../hooks/useCookingLog'
import { ExpiryAlerts } from '../components/dashboard/ExpiryAlerts'
import { StreakDisplay } from '../components/dashboard/StreakDisplay'
import { SavingsSnapshot } from '../components/dashboard/SavingsSnapshot'
import { RecipeSuggestion } from '../components/dashboard/RecipeSuggestion'

export function DashboardPage() {
  const { items } = useInventory()
  const cookingLog = useCookingLog()
  const navigate = useNavigate()

  const expiringItems = items.filter((i) => {
    const days = Math.ceil(
      (new Date(i.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
    return i.status === 'active' && days <= 3
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
