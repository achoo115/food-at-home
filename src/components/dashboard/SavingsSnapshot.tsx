interface Props {
  monthlySavings: number
}

export function SavingsSnapshot({ monthlySavings }: Props) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <p className="text-sm text-gray-500">Saved this month</p>
      <p className="text-2xl font-bold text-green-600">${monthlySavings.toFixed(0)}</p>
      <p className="text-xs text-gray-400">vs. ordering takeout</p>
    </div>
  )
}
