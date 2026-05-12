interface Props {
  streak: number
  weeklyCooks: number
}

export function StreakDisplay({ streak, weeklyCooks }: Props) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-bold text-green-600">{streak}</p>
          <p className="text-sm text-gray-500">day streak</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-gray-900">{weeklyCooks}/7</p>
          <p className="text-sm text-gray-500">this week</p>
        </div>
      </div>
    </div>
  )
}
