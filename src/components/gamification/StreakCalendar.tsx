interface Props {
  cookedDates: Set<string>
}

export function StreakCalendar({ cookedDates }: Props) {
  const today = new Date()
  const days: { date: string; cooked: boolean }[] = []

  for (let i = 27; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    days.push({ date: dateStr, cooked: cookedDates.has(dateStr) })
  }

  return (
    <div>
      <h3 className="font-semibold text-sm mb-2">Last 4 weeks</h3>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <div key={day.date} title={day.date} className={`w-full aspect-square rounded-sm ${day.cooked ? 'bg-green-500' : 'bg-gray-100'}`} />
        ))}
      </div>
    </div>
  )
}
