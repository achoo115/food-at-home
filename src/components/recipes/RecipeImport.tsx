import { useRef, useState } from 'react'
import { importFromUrl, importFromText, importFromImage, type ImportedRecipe } from '../../lib/importRecipe'
import { MacroBadges } from './MacroBadges'

interface Props {
  onSave: (recipe: ImportedRecipe) => Promise<void>
}

export function RecipeImport({ onSave }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<ImportedRecipe | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function run(fn: () => Promise<ImportedRecipe | null>, blockedMsg?: string) {
    setBusy(true); setError(''); setPreview(null); setSaved(false)
    try {
      const r = await fn()
      if (!r) setError(blockedMsg || 'Could not read a recipe from that.')
      else setPreview(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    }
    setBusy(false)
  }

  function handlePhoto(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      run(() => importFromImage(dataUrl.split(',')[1], dataUrl.split(';')[0].split(':')[1] || 'image/png'))
    }
    reader.readAsDataURL(file)
  }

  async function save() {
    if (!preview) return
    setBusy(true)
    await onSave(preview)
    setBusy(false); setSaved(true); setPreview(null); setText(''); setUrl('')
  }

  if (preview) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
        <h3 className="font-bold text-lg">{preview.title}</h3>
        {preview.description && <p className="text-sm text-gray-600">{preview.description}</p>}
        <p className="text-xs text-gray-500">Prep {preview.prep_time}m · Cook {preview.cook_time}m</p>
        <MacroBadges macros={preview} />
        <div>
          <h4 className="font-semibold text-sm mb-1">Ingredients ({preview.ingredients.length})</h4>
          <ul className="text-sm text-gray-700 space-y-0.5 list-disc pl-5">
            {preview.ingredients.map((i, n) => <li key={n}>{i}</li>)}
          </ul>
        </div>
        {preview.instructions && (
          <div>
            <h4 className="font-semibold text-sm mb-1">Instructions</h4>
            <p className="text-sm text-gray-700 whitespace-pre-line">{preview.instructions}</p>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="flex-1 py-2 bg-green-600 text-white rounded-lg font-semibold disabled:opacity-50">
            {busy ? 'Saving…' : 'Save recipe'}
          </button>
          <button onClick={() => setPreview(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg">Discard</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {saved && <p className="text-green-600 text-sm font-medium">Saved ✓ — find it in Saved / add it to This Week.</p>}

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Paste the recipe</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Paste the recipe text (ingredients + steps)…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <div className="flex gap-2 mt-2">
          <button onClick={() => run(() => importFromText(text))} disabled={busy || !text.trim()}
            className="flex-1 py-2 bg-green-600 text-white rounded-lg font-semibold text-sm disabled:opacity-50">
            {busy ? 'Reading…' : 'Import from text'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">Photo</button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">…or try a URL</label>
        <div className="flex gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://cooking.nytimes.com/recipes/…"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <button onClick={() => run(() => importFromUrl(url), "That site blocked the fetch (common for NYT). Open the recipe, copy the text, and paste it above.")}
            disabled={busy || !/^https?:\/\//i.test(url)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm disabled:opacity-50">
            Try URL
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">Works on many sites; paywalled/blocked pages — use paste or photo.</p>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  )
}
