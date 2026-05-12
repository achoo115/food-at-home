import { useAuth } from '../hooks/useAuth'
import { useCookingLog } from '../hooks/useCookingLog'
import { useAchievements } from '../hooks/useAchievements'
import { useInventory } from '../hooks/useInventory'
import { BadgeGrid } from '../components/gamification/BadgeGrid'
import { StreakCalendar } from '../components/gamification/StreakCalendar'

export function ProfilePage() {
  const { user, signOut } = useAuth()
  const cookingLog = useCookingLog()
  const { achievements } = useAchievements()
  const { items } = useInventory()

  const totalCooked = cookingLog.logs.length
  const wastedItems = items.filter((i) => i.status === 'expired' || i.status === 'wasted').length
  const consumedItems = items.filter((i) => i.status === 'consumed').length
  const wasteRate = consumedItems + wastedItems > 0
    ? Math.round((wastedItems / (consumedItems + wastedItems)) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stats</h1>
        <p className="text-sm text-gray-500">{user?.email}</p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
          <p className="text-2xl font-bold text-green-600">{totalCooked}</p>
          <p className="text-xs text-gray-500">Meals cooked</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
          <p className="text-2xl font-bold text-green-600">${cookingLog.getMonthlySavings().toFixed(0)}</p>
          <p className="text-xs text-gray-500">Saved/month</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
          <p className="text-2xl font-bold" style={{ color: wasteRate > 20 ? '#ef4444' : '#22c55e' }}>{wasteRate}%</p>
          <p className="text-xs text-gray-500">Waste rate</p>
        </div>
      </div>

      <StreakCalendar cookedDates={cookingLog.getCookedDates()} />

      <div>
        <h2 className="font-semibold mb-3">Achievements</h2>
        <BadgeGrid achievements={achievements} />
      </div>

      <button onClick={signOut} className="w-full py-2 text-red-500 text-sm">Sign Out</button>
    </div>
  )
}
