import { useState } from 'react'
import { useInventory } from '../hooks/useInventory'
import { InventoryList } from '../components/inventory/InventoryList'
import { AddItemModal } from '../components/inventory/AddItemModal'

export function InventoryPage() {
  const { items, loading, addItem, updateStatus } = useInventory()
  const [showAdd, setShowAdd] = useState(false)

  if (loading) return <p className="text-gray-400 text-center py-8">Loading...</p>

  return (
    <div>
      <InventoryList
        items={items}
        onMarkConsumed={(id) => updateStatus(id, 'consumed')}
        onMarkWasted={(id) => updateStatus(id, 'wasted')}
      />
      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-24 right-4 w-14 h-14 bg-green-600 text-white rounded-full text-2xl shadow-lg hover:bg-green-700"
      >
        +
      </button>
      <AddItemModal open={showAdd} onClose={() => setShowAdd(false)} onAdd={addItem} />
    </div>
  )
}
