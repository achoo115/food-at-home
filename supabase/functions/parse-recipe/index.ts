import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Fallback for gated pages: the user (a subscriber viewing the recipe) pastes the
// text or a screenshot; Claude parses it into the same normalized shape as the
// JSON-LD path. Not stored here; the client saves the returned recipe.
const systemPrompt = `You extract a single recipe from pasted text or a screenshot. Return JSON only, no markdown:
{
  "title": "Recipe Name",
  "description": "one line",
  "prep_time": 10,
  "cook_time": 20,
  "ingredients": ["2 cups flour", "1 tsp salt"],
  "instructions": "1. step\\n2. step",
  "calories": 520, "protein_g": 30, "carbs_g": 40, "fat_g": 18, "fiber_g": 6,
  "build": { "pro": ["..."], "base": ["..."], "veg": ["..."], "engine": ["..."] }
}
Rules: ingredients are an array of full lines. instructions is one numbered string.
Times in minutes (0 if unknown). Macros are per-serving best estimates if not stated
(fiber always included). "build" is the 4-pillar breakdown. If it is not a recipe, return {"error":"no recipe found"}.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    const body = await req.json()
    const content: unknown[] = []
    if (body.imageBase64) {
      content.push({ type: 'image', source: { type: 'base64', media_type: body.mediaType || 'image/png', data: body.imageBase64 } })
      content.push({ type: 'text', text: 'Extract the recipe from this image as JSON.' })
    } else if (typeof body.text === 'string' && body.text.trim()) {
      content.push({ type: 'text', text: `Extract the recipe from this text as JSON:\n\n${body.text.slice(0, 12000)}` })
    } else {
      return new Response(JSON.stringify({ error: 'Provide text or imageBase64' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1536, system: systemPrompt, messages: [{ role: 'user', content }] }),
    })
    const result = await response.json()
    if (result.error) {
      return new Response(JSON.stringify({ error: result.error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    let text = result.content?.[0]?.text || '{}'
    text = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim()
    let parsed: Record<string, unknown>
    try { parsed = JSON.parse(text) } catch {
      return new Response(JSON.stringify({ error: 'Failed to parse recipe from response' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (parsed.error || !parsed.title) {
      return new Response(JSON.stringify({ error: 'No recipe found in that input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
