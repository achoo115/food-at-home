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

// One page that never answers must not hold the whole batch on "Scanned 3 of 4…".
const PAGE_TIMEOUT_MS = 60_000

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
  const [partial, setPartial] = useState('')
  // Deals that were read but not saved: kept so a failed save can be retried
  // without photographing and reading the flyer again.
  const [unsaved, setUnsaved] = useState<{ items: ScannedSpecial[]; unread: number; pages: number } | null>(null)

  async function save(items: ScannedSpecial[], unread: number, pages: number) {
    setBusy(true)
    setError('')
    setStatus(`Saving ${items.length} deals…`)
    try {
      await onScanned(items)
      // The save replaces this week's scanned deals, so a page that dropped
      // out is worth knowing about before closing.
      if (unread) setPartial(`Saved ${items.length} deals, but ${unread} of ${pages} pages could not be read. Scan again to include them.`)
      else onDone()
    } catch (err) {
      setUnsaved({ items, unread, pages })
      setError(err instanceof Error ? err.message : 'Could not save the deals.')
      setBusy(false)
      setStatus('')
    }
  }

  // null = the page could not be read (bad file, error, or no answer in time)
  async function scanOne(file: File): Promise<ScannedSpecial[] | null> {
    try {
      const { base64, mediaType } = await readFile(file)
      const { data, error: fnError } = await supabase.functions.invoke('scan-specials', { body: { imageBase64: base64, mediaType }, timeout: PAGE_TIMEOUT_MS })
      if (fnError || data?.error || !Array.isArray(data)) return null
      return data as ScannedSpecial[]
    } catch {
      return null // one bad screenshot never sinks the batch
    }
  }

  async function handleFiles(files: File[]) {
    setBusy(true)
    setError('')
    let merged: ScannedSpecial[]
    let unread: number
    try {
      // Scan pages concurrently (cap 5) so 25 screenshots take seconds, not a minute;
      // tolerate per-page failures and just merge whatever parsed.
      const CONCURRENCY = 5
      const results: (ScannedSpecial[] | null)[] = new Array(files.length)
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

      unread = results.filter((r) => r === null).length
      merged = dedupe(results.flatMap((r) => r ?? []))
      if (merged.length === 0) throw new Error(unread ? 'Those pages could not be read — try again.' : 'No sale items found in those images.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the flyer.')
      setBusy(false)
      setStatus('')
      return
    }
    await save(merged, unread, files.length)
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files && files.length) handleFiles([...files])
    e.target.value = '' // allow re-picking the same files
  }

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onPick} />
      {partial ? (
        <>
          <p className="text-sm text-amber-600">{partial}</p>
          <button onClick={onDone} className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold">Done</button>
        </>
      ) : busy ? (
        <div className="w-full py-12 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 text-center">
          {status || 'Working…'}
        </div>
      ) : (
        <>
          {unsaved && (
            <button onClick={() => save(unsaved.items, unsaved.unread, unsaved.pages)} className="w-full py-2 bg-green-600 text-white rounded-lg font-semibold text-sm">
              Try saving again
            </button>
          )}
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
