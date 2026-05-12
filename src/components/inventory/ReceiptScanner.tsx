import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Category, Location, Unit } from '../../types/inventory'

interface ScannedItem {
  name: string
  quantity: number
  cost: number
  category: Category
}

interface AddItemInput {
  name: string
  category: Category
  location: Location
  quantity: number
  unit: Unit
  cost?: number
}

interface Props {
  onAdd: (item: AddItemInput) => Promise<unknown>
  onDone: () => void
}

export function ReceiptScanner({ onAdd, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([])
  const [locations, setLocations] = useState<Record<number, Location>>({})
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCapture(file: File) {
    setScanning(true)
    setError('')

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]

      try {
        const { data, error: fnError } = await supabase.functions.invoke('scan-receipt', {
          body: { imageBase64: base64 },
        })

        if (fnError) throw new Error(fnError.message)

        const items = Array.isArray(data) ? data : JSON.parse(data)
        setScannedItems(items)
        setLocations(Object.fromEntries(items.map((_: unknown, i: number) => [i, 'fridge'])))
      } catch {
        setError('Could not read receipt. Try manual entry.')
      }
      setScanning(false)
    }
    reader.readAsDataURL(file)
  }

  async function handleSaveAll() {
    setSaving(true)
    for (let i = 0; i < scannedItems.length; i++) {
      const item = scannedItems[i]
      await onAdd({
        name: item.name,
        category: item.category || 'other',
        location: locations[i] || 'fridge',
        quantity: item.quantity || 1,
        unit: 'count',
        cost: item.cost,
      })
    }
    setSaving(false)
    onDone()
  }

  if (scannedItems.length === 0) {
    return (
      <div className="space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => e.target.files?.[0] && handleCapture(e.target.files[0])}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
          className="w-full py-12 border-2 border-dashed border-gray-300 rounded-xl text-gray-500"
        >
          {scanning ? 'Scanning receipt...' : 'Tap to take a photo of your receipt'}
        </button>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">Found {scannedItems.length} items. Assign locations:</p>
      {scannedItems.map((item, i) => (
        <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
          <div>
            <p className="font-medium">{item.name}</p>
            <p className="text-xs text-gray-500">${item.cost?.toFixed(2) || '—'}</p>
          </div>
          <select
            value={locations[i] || 'fridge'}
            onChange={(e) => setLocations((prev) => ({ ...prev, [i]: e.target.value as Location }))}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1"
          >
            <option value="fridge">Fridge</option>
            <option value="freezer">Freezer</option>
            <option value="pantry">Pantry</option>
          </select>
        </div>
      ))}
      <button
        onClick={handleSaveAll}
        disabled={saving}
        className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold disabled:opacity-50"
      >
        {saving ? 'Adding...' : `Add ${scannedItems.length} items`}
      </button>
    </div>
  )
}
