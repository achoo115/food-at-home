import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { AddItemForm } from './AddItemForm'
import { Category, Location, Unit } from '../../types/inventory'

interface AddItemInput {
  name: string
  category: Category
  location: Location
  quantity: number
  unit: Unit
  expiry_date?: string
  cost?: number
}

type AddMode = 'manual' | 'receipt' | 'barcode'

interface Props {
  open: boolean
  onClose: () => void
  onAdd: (item: AddItemInput) => Promise<unknown>
}

export function AddItemModal({ open, onClose, onAdd }: Props) {
  const [mode, setMode] = useState<AddMode | null>(null)

  function handleClose() {
    setMode(null)
    onClose()
  }

  if (!mode) {
    return (
      <Modal open={open} onClose={handleClose} title="Add Items">
        <div className="space-y-3">
          <button onClick={() => setMode('manual')} className="w-full py-4 bg-gray-50 rounded-xl text-left px-4 hover:bg-gray-100">
            <p className="font-semibold">Manual Entry</p>
            <p className="text-sm text-gray-500">Type in item details</p>
          </button>
          <button onClick={() => setMode('receipt')} className="w-full py-4 bg-gray-50 rounded-xl text-left px-4 hover:bg-gray-100">
            <p className="font-semibold">Scan Receipt</p>
            <p className="text-sm text-gray-500">Take a photo of your receipt</p>
          </button>
          <button onClick={() => setMode('barcode')} className="w-full py-4 bg-gray-50 rounded-xl text-left px-4 hover:bg-gray-100">
            <p className="font-semibold">Scan Barcode</p>
            <p className="text-sm text-gray-500">Scan a product barcode</p>
          </button>
        </div>
      </Modal>
    )
  }

  if (mode === 'manual') {
    return (
      <Modal open={open} onClose={handleClose} title="Add Item">
        <AddItemForm onAdd={onAdd} onDone={handleClose} />
      </Modal>
    )
  }

  // Receipt scanner (Task 22) and barcode scanner (Task 23) are wired in Chunk 6
  return (
    <Modal open={open} onClose={handleClose} title={mode === 'receipt' ? 'Scan Receipt' : 'Scan Barcode'}>
      <p className="text-gray-500 text-center py-8">Scanner will be wired in Chunk 6</p>
    </Modal>
  )
}
