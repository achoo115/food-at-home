import { useState } from 'react'
import { useSpecials } from '../../hooks/useSpecials'
import { SpecialsScanner } from './SpecialsScanner'

// "On sale this week" — the ingested Whole Foods specials the planner favors.
export function SpecialsCard() {
  const { specials, loading, saveScanned, clearWeek, totalSavings } = useSpecials()
  const [scanning, setScanning] = useState(false)

  if (loading) return null

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">On sale this week</p>
        {specials.length > 0 && !scanning && (
          <button onClick={clearWeek} className="text-xs text-gray-300">Clear</button>
        )}
      </div>

      {scanning ? (
        <SpecialsScanner onScanned={async (items) => { await saveScanned(items) }} onDone={() => setScanning(false)} />
      ) : specials.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">Scan your store's weekly flyer and the AI planner will favor what's on sale.</p>
          <button onClick={() => setScanning(true)} className="w-full py-2 bg-green-600 text-white rounded-lg font-semibold text-sm">
            Scan sales flyer
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {specials.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-800">{s.item}</span>
              <span className="text-gray-500 tabular-nums">
                {s.regular_price != null && s.sale_price != null && (
                  <span className="line-through text-gray-300 mr-1">${s.regular_price.toFixed(2)}</span>
                )}
                {s.sale_price != null ? <span className="text-green-700 font-semibold">${s.sale_price.toFixed(2)}</span> : '—'}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-50">
            <button onClick={() => setScanning(true)} className="text-xs text-green-600 font-medium">Re-scan flyer</button>
            {totalSavings > 0 && <span className="text-xs text-gray-400">~${totalSavings.toFixed(2)} off vs regular</span>}
          </div>
        </div>
      )}
    </div>
  )
}
