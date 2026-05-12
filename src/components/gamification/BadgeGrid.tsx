import type { Achievement } from '../../types/gamification'
import { achievementDefinitions } from '../../data/achievements'
import { BadgeCard } from './BadgeCard'

interface Props {
  achievements: Achievement[]
}

export function BadgeGrid({ achievements }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {achievementDefinitions.map((def) => {
        const earned = achievements.find((a) => a.type === def.type)
        return <BadgeCard key={def.type} definition={def} earned={!!earned} earnedAt={earned?.earned_at} />
      })}
    </div>
  )
}
