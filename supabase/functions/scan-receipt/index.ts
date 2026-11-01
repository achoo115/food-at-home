import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const MODEL = 'claude-haiku-4-5-20251001'
const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 4 * 1024 * 1024 // post-base64-decode per image (API limit 5 MB)
const MAX_BODY_BYTES = 20 * 1024 * 1024
const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SYSTEM = `You extract grocery line items from photos or screenshots of receipts and online grocery orders (Amazon / Whole Foods, Instacart, paper receipts). Record every food item once through the record_items tool.

RULES

name: the product words, cleaned. Drop trademark symbols and legal noise; keep the brand and product. Keep a size suffix only if it is part of the identity. Examples: "Chobani® 20g Protein Lowfat Greek Yogurt Strawberry Kiwi 6.7oz" -> "Chobani Greek Yogurt Strawberry Kiwi"; "HOBOKEN FARMS Basil Marinara, 25 OZ" -> "Hoboken Farms Basil Marinara".

quantity and unit_price: when a row reads "Qty: N @ $X each", quantity = N and unit_price = X.

line_total: the amount actually paid for the row.
- If the row shows "$P promotions applied", line_total = (unit_price x quantity) - P. COMPUTE it; never copy a number that may be cut off at the edge of the screenshot.
- If no promotion is shown, line_total = unit_price x quantity.
- A number printed in the right-hand column is a cross-check only. If it disagrees with your computed value by more than $0.05, trust the computed value.
- Never put the per-unit price in line_total when a promotion exists.

weight-priced rows ("1.14 lb @ $9.99/lb"): quantity = 1, unit_price = null, line_total = the charged amount after any promotion.

location: sold frozen -> "freezer". Shelf-stable sealed goods (cans, jars, bottles, cartons, boxed dry goods, pasta, rice, oil, vinegar, jarred sauces) -> "pantry". Fresh produce, dairy, eggs, fresh meat and fish, deli, prepared chilled foods, and anything whose label would say keep refrigerated (kimchi, miso, hummus, fresh salsa, refrigerated pasta sauce) -> "fridge". When unsure -> "fridge".

container: the packaging the product is sold in. Pasta sauce / salsa / pickles / nut butter / jam -> "jar". Soup, beans, tuna, coconut milk -> "can". Oil, vinegar, soda, juice, passata -> "bottle". Milk, cream, broth, eggs -> "carton". Cereal, crackers, pasta, roux -> "box". Chips, frozen vegetables, rice, flour -> "bag". Loose or packaged fresh food -> "fresh". Anything sold frozen -> "frozen". Otherwise "other".

DEDUPE: the images may be overlapping screenshots scrolled through ONE order. The same product may appear in more than one image, and a row cut off at the bottom of one image is usually shown whole in the next. Record each distinct product EXACTLY ONCE, from the image where its row is most complete. Never add quantities across images.

EXCLUDE: non-food purchases (household, paper goods, cleaning, pet, health and beauty, gift cards, bags), delivery and service fees, tips, taxes, subtotals, totals, savings summary lines, store and order metadata, and any promotion line on its own. If there are no food items, call the tool with an empty items array.`

const TOOL = {
  name: 'record_items',
  description: 'Record the grocery line items found in the images.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            quantity: { type: 'integer', minimum: 1 },
            unit_price: { type: ['number', 'null'] },
            line_total: { type: ['number', 'null'] },
            category: { type: 'string', enum: ['produce', 'protein', 'dairy', 'grain', 'condiment', 'beverage', 'snack', 'other'] },
            location: { type: 'string', enum: ['fridge', 'freezer', 'pantry'] },
            container: { type: 'string', enum: ['can', 'jar', 'bottle', 'carton', 'box', 'bag', 'fresh', 'frozen', 'other'] },
          },
          required: ['name', 'quantity', 'unit_price', 'line_total', 'category', 'location', 'container'],
        },
      },
    },
    required: ['items'],
  },
}

interface Img { base64: string; mediaType: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const len = Number(req.headers.get('content-length') || 0)
    if (len > MAX_BODY_BYTES) return json({ error: 'Photos too large — try fewer or smaller screenshots' }, 413)
    if (!(req.headers.get('content-type') || '').includes('application/json')) {
      return json({ error: 'Send JSON: { images: [{ base64, mediaType }] }' }, 400)
    }
    const body = await req.json()
    // Legacy single-image shape still accepted.
    const images: Img[] = Array.isArray(body.images)
      ? body.images
      : body.imageBase64 ? [{ base64: body.imageBase64, mediaType: body.mediaType || 'image/png' }] : []

    if (images.length === 0) return json({ error: 'No images' }, 400)
    if (images.length > MAX_IMAGES) return json({ error: `At most ${MAX_IMAGES} photos per scan` }, 400)
    for (const [i, img] of images.entries()) {
      if (typeof img?.base64 !== 'string' || !img.base64) return json({ error: `Photo ${i + 1} is empty` }, 400)
      if (!ALLOWED_MEDIA.has(img.mediaType)) return json({ error: `Photo ${i + 1}: unsupported type ${img.mediaType}` }, 400)
      if (img.base64.length * 0.75 > MAX_IMAGE_BYTES) return json({ error: `Photo ${i + 1} is too large` }, 413)
    }

    const content: unknown[] = []
    images.forEach((img, i) => {
      content.push({ type: 'text', text: `Screenshot ${i + 1} of ${images.length} (scrolled top to bottom):` })
      content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } })
    })
    content.push({ type: 'text', text: 'Record the grocery items as specified.' })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'record_items' },
        messages: [{ role: 'user', content }],
      }),
    })
    const result = await response.json()
    if (result.error) return json({ error: result.error.message || 'Model error' }, 502)

    const stopReason = result.stop_reason
    const usage = result.usage ?? {}
    if (stopReason === 'max_tokens') {
      return json({ error: 'The reply was cut off — try fewer screenshots per scan', stop_reason: stopReason, usage }, 502)
    }
    const toolUse = (result.content ?? []).find((b: { type: string }) => b.type === 'tool_use')
    const items = toolUse?.input?.items
    if (!Array.isArray(items)) {
      const text = (result.content ?? []).find((b: { type: string }) => b.type === 'text')?.text ?? ''
      return json({ error: `Model did not return items (${stopReason}): ${String(text).slice(0, 200)}`, stop_reason: stopReason, usage }, 502)
    }

    console.log(JSON.stringify({ images: images.length, raw_items: items.length, stop_reason: stopReason, output_tokens: usage.output_tokens, cache_read: usage.cache_read_input_tokens }))
    return json({ items, meta: { images: images.length, raw_count: items.length, stop_reason: stopReason, output_tokens: usage.output_tokens ?? null, cache_read_input_tokens: usage.cache_read_input_tokens ?? null } })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
