import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { lookupBarcode } from '../../lib/openFoodFacts'
import { AddItemForm } from './AddItemForm'
import type { Category, Location, Unit } from '../../types/inventory'

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

// html5-qrcode's stop() THROWS (it does not reject) when the scanner is not
// running or is already stopping — which is the case in the effect cleanup
// after every decode and after a camera that never started. An exception in a
// cleanup takes the whole screen down.
function safeStop(scanner: Html5Qrcode) {
  try { scanner.stop().catch(() => {}) } catch { /* not running */ }
}

export function BarcodeScanner({ onAdd, onDone }: Props) {
  const [scannedProduct, setScannedProduct] = useState<{ name: string; category: string } | null>(null)
  const [scanning, setScanning] = useState(true)
  const [error, setError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    if (!scanning || !containerRef.current) return

    const scannerId = 'barcode-scanner-' + Date.now()
    containerRef.current.id = scannerId

    const scanner = new Html5Qrcode(scannerId)
    scannerRef.current = scanner

    const started = scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      async (decodedText) => {
        safeStop(scanner)
        setScanning(false)

        try {
          const product = await lookupBarcode(decodedText)
          if (product) {
            setScannedProduct({ name: product.name, category: product.category })
          } else {
            setError(`No product found for barcode: ${decodedText}`)
          }
        } catch {
          setError('Lookup failed. Enter item manually.')
        }
      },
      () => {}
    )
    started.catch(() => {
      setError('Camera access denied')
      setScanning(false)
    })

    return () => {
      // After start settles: a camera still opening when the screen closes
      // would otherwise stay on.
      started.then(() => safeStop(scanner), () => {})
    }
  }, [scanning])

  if (scannedProduct) {
    return (
      <div>
        <p className="text-sm text-gray-500 mb-3">Found: <strong>{scannedProduct.name}</strong></p>
        <AddItemForm onAdd={onAdd} onDone={onDone} defaultName={scannedProduct.name} defaultCategory={scannedProduct.category as Category} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {scanning && <div ref={containerRef} className="w-full rounded-lg overflow-hidden" />}
      {error && (
        <div>
          <p className="text-red-500 text-sm mb-3">{error}</p>
          <button onClick={() => { setError(''); setScanning(true) }} className="w-full py-2 mb-3 bg-gray-100 text-gray-700 rounded-lg font-semibold">Scan again</button>
          <AddItemForm onAdd={onAdd} onDone={onDone} />
        </div>
      )}
    </div>
  )
}
