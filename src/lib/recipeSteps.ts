// Split a recipe's free-text `instructions` into discrete cooking steps for Cook
// Mode. Instructions arrive in three shapes with no common delimiter:
//   - Spoonacular: often HTML (<ol><li>…</li></ol> or <p>…</p>)
//   - Claude AI: numbered prose ("1. Do this. 2. Do that.")
//   - NYT import: newline-separated steps
//
// Strategy (Gemini's call): parse conservatively. When structure is clear, split
// on it; when it isn't, return the whole thing as ONE step rather than risk a
// wrong split. The backfill script flags single-step recipes for manual review,
// so the messy tail gets hand-corrected once instead of mis-parsed forever.

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
}

function clean(s: string): string {
  // Drop any leading "1. " / "2) " / "Step 3:" numbering left on a step.
  return stripTags(s)
    .replace(/^\s*(?:step\s*)?\d{1,2}\s*[.):-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function splitSteps(instructions: string | null | undefined): string[] {
  const raw = (instructions ?? '').trim()
  if (!raw) return []

  // 1. HTML list/paragraph markup → one step per <li> (or <p>).
  if (/<\/?(li|ol|ul|p)\b/i.test(raw)) {
    const items = [...raw.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => clean(m[1]))
    const found = items.filter(Boolean)
    if (found.length >= 1) return found
    const paras = [...raw.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => clean(m[1])).filter(Boolean)
    if (paras.length >= 1) return paras
  }

  // 2. Multiple non-empty lines → one step per line.
  const lines = raw.split(/\r?\n/).map(clean).filter(Boolean)
  if (lines.length >= 2) return lines

  // 3. Single blob of "1. … 2. … 3. …" numbered prose. Split only where a 1-2
  //    digit number is followed by "." or ")" AND whitespace — so "1.5 cups" and
  //    "350 degrees" (no punctuation+space) never trigger a split.
  const single = stripTags(raw).replace(/\s+/g, ' ').trim()
  if (/(?:^|\s)\d{1,2}[.)]\s+/.test(single)) {
    const parts = single
      .split(/(?:^|\s)(?=\d{1,2}[.)]\s+)/)
      .map(clean)
      .filter(Boolean)
    if (parts.length >= 2) return parts
  }

  // 4. Unsure → one step (whole text). Backfill flags these for manual fix.
  return [clean(single)]
}
