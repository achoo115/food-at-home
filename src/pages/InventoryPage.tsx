import { useState } from 'react'
import { useInventory } from '../hooks/useInventory'
import { useGroceryList } from '../hooks/useGroceryList'
import { InventoryList } from '../components/inventory/InventoryList'
import { AddItemModal } from '../components/inventory/AddItemModal'
import { GroceryList } from '../components/grocery/GroceryList'
import { CheckInFlow } from '../components/grocery/CheckInFlow'

export function InventoryPage() {
  const { items, loading, addItem, updateStatus } = useInventory()
  const grocery = useGroceryList()
  const [showAdd, setShowAdd] = useState(false)
  const [showCheckIn, setShowCheckIn] = useState(false)
  const [tab, setTab] = useState<'inventory' | 'grocery'>('inventory')

  if (loading) return <p className="text-gray-400 text-center py-8">Loading...</p>

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('inventory')}
          className={`flex-1 py-2 rounded-lg font-semibold text-sm ${
            tab === 'inventory' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Inventory
        </button>
        <button
          onClick={() => setTab('grocery')}
          className={`flex-1 py-2 rounded-lg font-semibold text-sm ${
            tab === 'grocery' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Shopping List
        </button>
      </div>

      {tab === 'inventory' ? (
        <>
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
          <AddItemModal
            open={showAdd}
            onClose={() => setShowAdd(false)}
            onAdd={addItem}
          />
        </>
      ) : (
        <>
          <GroceryList
            uncheckedItems={grocery.uncheckedItems}
            checkedItems={grocery.checkedItems}
            onAdd={(name) => grocery.addItem(name)}
            onToggle={grocery.toggleCheck}
            onDelete={grocery.deleteItem}
            onCheckIn={() => setShowCheckIn(true)}
          />
          <CheckInFlow
            open={showCheckIn}
            onClose={() => setShowCheckIn(false)}
            items={grocery.checkedItems}
            onCheckIn={async (items) => {
              for (const item of items) await addItem(item)
            }}
            onClearChecked={grocery.clearChecked}
          />
        </>
      )}
    </div>
  )
}
