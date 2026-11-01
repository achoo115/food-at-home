import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Category, Location, Unit, Container } from '../../types/inventory'
import { normalizeScanItems, type ScannedItem } from '../../lib/scanItems'
import { prepareImage, MAX_IMAGES, type PreparedImage } from '../../lib/imagePrep'

interface AddItemInput {
  name: string
  category: Category
  location: Location
  quantity: number
  unit: Unit
  cost?: number
  container?: Container | null
}

interface Props {
  onAdd: (item: AddItemInput) => Promise<unknown>
  onDone: () => void
  /** Called with true while a scan is in flight so the host can block dismissal. */
  onBusy?: (busy: boolean) => void
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'preparing'; done: number; total: number }
  | { kind: 'scanning'; total: number }
  | { kind: 'review' }
  | { kind: 'saving'; done: number; total: number }

const SCAN_TIMEOUT_MS = 60_000

export function ReceiptScanner({ onAdd, onDone, onBusy }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [images, setImages] = useState<PreparedImage[]>([])
  const [items, setItems] = useState<ScannedItem[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const busy = phase.kind === 'preparing' || phase.kind === 'scanning' || phase.kind === 'saving'
  useEffect(() => { onBusy?.(busy) }, [busy, onBusy])
  useEffect(() => () => { images.forEach((i) => URL.revokeObjectURL(i.previewUrl)); abortRef.current?.abort() }, [images])

  async function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, MAX_IMAGES)
    if (files.length === 0) return
    setError('')
    setNote(list && list.length > MAX_IMAGES ? `Only the first ${MAX_IMAGES} photos were used.` : '')

    // One at a time: a 12 MP decode is ~49 MB; several at once jettisons the PWA.
    const prepared: PreparedImage[] = []
    for (let i = 0; i < files.length; i++) {
      setPhase({ kind: 'preparing', done: i, total: files.length })
      try {
        prepared.push(await prepareImage(files[i]))
      } catch (err) {
        setError(err instanceof Error ? err.message : `Could not read photo ${i + 1}`)
      }
    }
    if (prepared.length === 0) { setPhase({ kind: 'idle' }); return }
    setImages(prepared)
    await scan(prepared)
  }

  async function scan(prepared: PreparedImage[]) {
    setPhase({ kind: 'scanning', total: prepared.length })
    const controller = new AbortController()
    abortRef.current = controller
    const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('scan-receipt', {
        body: { images: prepared.map(({ base64, mediaType }) => ({ base64, mediaType })) },
        signal: controller.signal,
      })
      if (fnError) {
        // FunctionsHttpError hides the body behind a generic message; surface the real reason.
        const ctx = (fnError as { context?: Response }).context
        let detail = ''
        try { detail = ctx ? ((await ctx.json()) as { error?: string }).error ?? '' : '' } catch { /* body unreadable */ }
        throw new Error(detail || fnError.message)
      }
      if (data?.error) throw new Error(String(data.error))
      const raw = Array.isArray(data) ? data : data?.items
      const { items: found, merged } = normalizeScanItems(raw)
      if (found.length === 0) throw new Error('No food items found in the photo(s). Try manual entry.')
      setItems(found)
      if (merged > 0) setNote((n) => [n, `${merged} repeated line${merged === 1 ? '' : 's'} merged across photos.`].filter(Boolean).join(' '))
      setPhase({ kind: 'review' })
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError'
      setError(aborted ? 'Scan timed out. Try fewer photos.' : err instanceof Error ? err.message : 'Could not read receipt. Try manual entry.')
      setPhase({ kind: 'idle' })
    } finally {
      clearTimeout(timer)
      abortRef.current = null
    }
  }

  function update(id: string, patch: Partial<ScannedItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  async function handleSaveAll() {
    setError('')
    let done = 0
    setPhase({ kind: 'saving', done, total: items.length })
    const failed: ScannedItem[] = []
    for (const item of items) {
      try {
        const res = (await onAdd({
          name: item.name,
          category: item.category,
          location: item.location,
          quantity: item.quantity,
          unit: 'count',
          cost: item.cost ?? undefined,
          container: item.container === 'other' ? null : item.container,
        })) as { error?: unknown } | undefined
        if (res && res.error) failed.push(item)
      } catch {
        failed.push(item)
      }
      done++
      setPhase({ kind: 'saving', done, total: items.length })
    }
    if (failed.length) {
      setItems(failed)
      setError(`${failed.length} item${failed.length === 1 ? '' : 's'} could not be saved. They are still listed below — try again.`)
      setPhase({ kind: 'review' })
      return
    }
    onDone()
  }

  if (phase.kind === 'preparing' || phase.kind === 'scanning') {
    const label = phase.kind === 'preparing'
      ? `Preparing photo ${phase.done + 1} of ${phase.total}…`
      : `Reading ${phase.total === 1 ? 'the photo' : `${phase.total} photos`}… about ${10 + 5 * phase.total}s`
    return (
      <div className="space-y-3">
        <div className="w-full py-12 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 text-center">
          <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-green-600" />
          {label}
        </div>
        {phase.kind === 'scanning' && (
          <button onClick={() => abortRef.current?.abort()} className="w-full py-2 text-sm text-gray-500">Cancel</button>
        )}
      </div>
    )
  }

  if (phase.kind === 'idle') {
    return (
      <div className="space-y-3">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files; e.target.value = ''; handleFiles(f) }} />
        <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { const f = e.target.files; e.target.value = ''; handleFiles(f) }} />
        <button onClick={() => cameraRef.current?.click()} className="w-full py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500">
          Take a photo
        </button>
        <button onClick={() => libraryRef.current?.click()} className="w-full py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500">
          Choose from library
          <span className="block text-xs text-gray-400 mt-1">Select up to {MAX_IMAGES} screenshots of one order</span>
        </button>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>
    )
  }

  const saving = phase.kind === 'saving'
  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <img key={img.previewUrl} src={img.previewUrl} alt={`Photo ${i + 1}`} className="h-16 w-12 object-cover rounded-md border border-gray-200 flex-none" />
          ))}
        </div>
      )}
      <p className="text-sm text-gray-500">Found {items.length} item{items.length === 1 ? '' : 's'}. Check locations, remove anything wrong:</p>
      {note && <p className="text-xs text-gray-400">{note}</p>}
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg p-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{item.name}</p>
            <p className="text-xs text-gray-500">
              {item.quantity > 1 ? `×${item.quantity} · ` : ''}{item.cost !== null ? `$${item.cost.toFixed(2)}` : '—'}
              {item.container !== 'other' ? ` · ${item.container}` : ''}
            </p>
          </div>
          <select value={item.location} onChange={(e) => update(item.id, { location: e.target.value as Location })}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1" aria-label={`Location for ${item.name}`}>
            <option value="fridge">Fridge</option>
            <option value="freezer">Freezer</option>
            <option value="pantry">Pantry</option>
          </select>
          <button onClick={() => setItems((prev) => prev.filter((it) => it.id !== item.id))} className="text-gray-400 px-1" title="Remove" aria-label={`Remove ${item.name}`}>✕</button>
        </div>
      ))}
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button onClick={handleSaveAll} disabled={saving || items.length === 0}
        className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold disabled:opacity-50">
        {saving ? `Adding ${phase.done} of ${phase.total}…` : `Add ${items.length} item${items.length === 1 ? '' : 's'}`}
      </button>
    </div>
  )
}
