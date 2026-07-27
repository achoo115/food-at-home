import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ScannedSpecial } from '../../hooks/useSpecials'

interface Props {
  onScanned: (items: ScannedSpecial[]) => Promise<void>
  onDone: () => void
}

// Photograph the weekly flyer / Prime-deals screen; scan-specials (Claude vision)
// parses it into structured specials. Mirrors ReceiptScanner.
export function SpecialsScanner({ onScanned, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCapture(file: File) {
    setScanning(true)
    setError('')
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(',')[1]
      const mediaType = dataUrl.split(';')[0].split(':')[1] || 'image/png'
      try {
        const { data, error: fnError } = await supabase.functions.invoke('scan-specials', {
          body: { imageBase64: base64, mediaType },
        })
        if (fnError) throw new Error(fnError.message)
        if (data?.error) throw new Error(data.error)
        const items = (Array.isArray(data) ? data : []) as ScannedSpecial[]
        if (items.length === 0) throw new Error('No sale items found in that image.')
        setSaving(true)
        await onScanned(items)
        setSaving(false)
        onDone()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read the flyer.')
        setScanning(false)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleCapture(e.target.files[0])} />
      {scanning || saving ? (
        <div className="w-full py-12 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 text-center">
          {saving ? 'Saving deals…' : 'Reading the flyer…'}
        </div>
      ) : (
        <>
          <button onClick={() => { fileRef.current?.setAttribute('capture', 'environment'); fileRef.current?.click() }}
            className="w-full py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500">
            Take a photo of the flyer
          </button>
          <button onClick={() => { fileRef.current?.removeAttribute('capture'); fileRef.current?.click() }}
            className="w-full py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500">
            Choose a screenshot
          </button>
          <button onClick={onDone} className="w-full py-2 text-gray-400 text-sm">Cancel</button>
        </>
      )}
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  )
}
