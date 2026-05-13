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
    // Accept both JSON (with base64) and raw binary uploads
    let imageBase64: string
    let mediaType: string

    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const body = await req.json()
      imageBase64 = body.imageBase64
      mediaType = body.mediaType || 'image/png'
    } else {
      // Binary upload — convert to base64
      const buffer = new Uint8Array(await req.arrayBuffer())
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < buffer.length; i += chunkSize) {
        binary += String.fromCharCode(...buffer.subarray(i, i + chunkSize))
      }
      imageBase64 = btoa(binary)
      mediaType = contentType || 'image/png'
    }

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
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `Extract grocery items from this receipt or order screenshot. Return JSON array only, no markdown fences, no explanation:
[{ "name": "item name", "quantity": 1, "cost": 3.99, "category": "produce|protein|dairy|grain|condiment|beverage|snack|other" }]

Only include food items. Skip non-food purchases, taxes, totals, store info, and promotions.`,
            },
          ],
        }],
      }),
    })

    const result = await response.json()

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let text = result.content?.[0]?.text || '[]'
    text = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim()

    // Validate it's actually a JSON array
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) {
        return new Response('[]', {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } catch {
      // Claude returned non-JSON text — no items found
      return new Response('[]', {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(text, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
