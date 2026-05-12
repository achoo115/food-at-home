import type { AchievementDefinition } from '../../data/achievements'

interface Props {
  definition: AchievementDefinition
  earned: boolean
  earnedAt?: string
}

export function BadgeCard({ definition, earned, earnedAt }: Props) {
  return (
    <div className={`rounded-xl p-3 text-center ${earned ? 'bg-white shadow-sm border border-gray-100' : 'bg-gray-50 opacity-50'}`}>
      <span className="text-3xl">{definition.icon}</span>
      <p className="font-semibold text-sm mt-1">{definition.name}</p>
      <p className="text-xs text-gray-500 mt-0.5">{definition.description}</p>
      {earned && earnedAt && (
        <p className="text-xs text-green-600 mt-1">{new Date(earnedAt).toLocaleDateString()}</p>
      )}
    </div>
  )
}
