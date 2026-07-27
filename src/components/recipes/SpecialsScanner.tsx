import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { ScannedSpecial } from '../../hooks/useSpecials'

interface Props {
  onScanned: (items: ScannedSpecial[]) => Promise<void>
  onDone: () => void
}

function readFile(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = () => {
      const dataUrl = reader.result as string
      resolve({ base64: dataUrl.split(',')[1], mediaType: dataUrl.split(';')[0].split(':')[1] || 'image/png' })
    }
    reader.readAsDataURL(file)
  })
}

// Merge specials from several flyer pages, deduping by item name (case-insensitive)
// and preferring an entry that actually has a sale price.
function dedupe(items: ScannedSpecial[]): ScannedSpecial[] {
  const byName = new Map<string, ScannedSpecial>()
  for (const it of items) {
    const key = (it.item || '').trim().toLowerCase()
    if (!key) continue
    const existing = byName.get(key)
    if (!existing || (existing.sale_price == null && it.sale_price != null)) byName.set(key, it)
  }
  return [...byName.values()]
}

// Photograph / screenshot the weekly flyer (often several pages) → scan-specials
// (Claude vision) parses each into structured specials, merged into one list.
export function SpecialsScanner({ onScanned, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function scanOne(file: File): Promise<ScannedSpecial[]> {
    try {
      const { base64, mediaType } = await readFile(file)
      const { data, error: fnError } = await supabase.functions.invoke('scan-specials', { body: { imageBase64: base64, mediaType } })
      if (fnError || data?.error || !Array.isArray(data)) return []
      return data as ScannedSpecial[]
    } catch {
      return [] // one bad screenshot never sinks the batch
    }
  }

  async function handleFiles(files: File[]) {
    setBusy(true)
    setError('')
    try {
      // Scan pages concurrently (cap 5) so 25 screenshots take seconds, not a minute;
      // tolerate per-page failures and just merge whatever parsed.
      const CONCURRENCY = 5
      const results: ScannedSpecial[][] = new Array(files.length)
      let done = 0
      let next = 0
      const worker = async () => {
        while (next < files.length) {
          const i = next++
          results[i] = await scanOne(files[i])
          done++
          setStatus(`Scanned ${done} of ${files.length}…`)
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker))

      const merged = dedupe(results.flat())
      if (merged.length === 0) throw new Error('No sale items found in those images.')
      setStatus(`Saving ${merged.length} deals…`)
      await onScanned(merged)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the flyer.')
      setBusy(false)
      setStatus('')
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files && files.length) handleFiles([...files])
    e.target.value = '' // allow re-picking the same files
  }

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onPick} />
      {busy ? (
        <div className="w-full py-12 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 text-center">
          {status || 'Working…'}
        </div>
      ) : (
        <>
          <button onClick={() => { fileRef.current?.setAttribute('capture', 'environment'); fileRef.current?.click() }}
            className="w-full py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500">
            Take a photo of the flyer
          </button>
          <button onClick={() => { fileRef.current?.removeAttribute('capture'); fileRef.current?.click() }}
            className="w-full py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500">
            Choose screenshots or a PDF <span className="text-gray-400 text-sm">(pick multiple)</span>
          </button>
          <p className="text-xs text-gray-400 leading-relaxed">
            Tip: open the deals page in <b>Safari</b>, take a screenshot, tap it, choose <b>Full Page</b> and
            Save to Files — that grabs the whole list as one PDF. Pick it here instead of 25 screenshots.
          </p>
          <button onClick={onDone} className="w-full py-2 text-gray-400 text-sm">Cancel</button>
        </>
      )}
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  )
}
