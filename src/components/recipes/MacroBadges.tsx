import { formatMacros, hasMacros, type MacroSet } from '../../lib/macros'

// Small macro chips (fiber first-class). Renders nothing when no macros are set,
// so recipes without nutrition data look exactly as before.
export function MacroBadges({ macros, className = '' }: { macros: MacroSet; className?: string }) {
  if (!hasMacros(macros)) return null
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {formatMacros(macros).map(({ label, value }) => (
        <span
          key={label}
          className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap"
        >
          <span className="font-semibold text-gray-800">{value}</span> {label}
        </span>
      ))}
    </div>
  )
}
