import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { title, ingredients, servings } = await req.json()

    const systemPrompt = `You estimate the grocery cost of a home recipe using typical average US supermarket prices. Return JSON only, no markdown.

Return format:
{ "servings": 4, "cost_total": 11.20, "cost_per_serving": 2.80 }

Rules:
- cost_total is the estimated total ingredient cost in US dollars for the whole recipe.
- If a servings count is given, use it exactly. Otherwise estimate a realistic servings count.
- cost_per_serving = cost_total / servings, rounded to 2 decimals.
- All three values are numbers (no currency symbols).`

    const lines = (ingredients ?? []).map((i: { quantity: number; unit: string; name: string }) =>
      `- ${[i.quantity, i.unit, i.name].filter(Boolean).join(' ')}`).join('\n')
    let userPrompt = `Recipe: ${title}\nIngredients:\n${lines}`
    if (typeof servings === 'number' && servings > 0) userPrompt += `\n\nServings (use exactly): ${servings}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    const result = await response.json()
    if (result.error) {
      return new Response(JSON.stringify({ error: result.error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let text = result.content?.[0]?.text || '{}'
    text = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim()

    let parsed: { servings?: number; cost_total?: number; cost_per_serving?: number }
    try {
      parsed = JSON.parse(text)
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to parse economics JSON' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (typeof parsed.cost_total !== 'number' || typeof parsed.servings !== 'number') {
      return new Response(JSON.stringify({ error: 'Model response missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const s = servings && servings > 0 ? servings : parsed.servings
    if (!(s > 0)) {
      return new Response(JSON.stringify({ error: 'Model returned an invalid servings count' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const costTotal = Math.round(parsed.cost_total * 100) / 100
    const perServing = Math.round((costTotal / s) * 100) / 100
    return new Response(JSON.stringify({ servings: s, cost_total: costTotal, cost_per_serving: perServing }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
