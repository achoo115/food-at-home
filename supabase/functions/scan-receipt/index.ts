import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  const { imageBase64 } = await req.json()

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
          },
          {
            type: 'text',
            text: `Extract grocery items from this receipt. Return JSON array only, no markdown:
[{ "name": "item name", "quantity": 1, "cost": 3.99, "category": "produce|protein|dairy|grain|condiment|beverage|snack|other" }]

Only include food items. Skip non-food purchases, taxes, totals, and store info.`,
          },
        ],
      }],
    }),
  })

  const result = await response.json()
  const text = result.content?.[0]?.text || '[]'

  return new Response(text, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
})
