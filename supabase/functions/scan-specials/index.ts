import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    let imageBase64: string
    let mediaType: string
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = await req.json()
      imageBase64 = body.imageBase64
      mediaType = body.mediaType || 'image/png'
    } else {
      const buffer = new Uint8Array(await req.arrayBuffer())
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < buffer.length; i += chunkSize) {
        binary += String.fromCharCode(...buffer.subarray(i, i + chunkSize))
      }
      imageBase64 = btoa(binary)
      mediaType = contentType || 'image/png'
    }

    const systemPrompt = `You read a grocery store weekly sales flyer or deals screenshot and extract the items on sale. Return JSON only, no markdown: an array of
[
  { "item": "product name", "regular_price": 4.99, "sale_price": 2.99, "category": "produce" }
]
Rules:
- Include only items that are ON SALE (have a discounted/sale price).
- sale_price is the discounted price; regular_price is the original if shown, else null.
- category is a short lowercase grocery category (produce, meat, seafood, dairy, bakery, frozen, pantry, snacks, beverages, household), best guess.
- Omit prices you cannot read (use null). Keep item names concise and real.
- If the image is not a sales flyer, return [].`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: 'Extract every item on sale from this flyer as JSON.' },
          ],
        }],
      }),
    })

    const result = await response.json()
    if (result.error) {
      return new Response(JSON.stringify({ error: result.error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let text = result.content?.[0]?.text || '[]'
    text = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to parse specials JSON from model response' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!Array.isArray(parsed)) {
      return new Response(JSON.stringify({ error: 'Model response was not a specials array' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
