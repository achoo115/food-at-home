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
    const { ingredients, expiringItems, mood, maxTime, cuisine, constraints, onSaleItems } = await req.json()

    const systemPrompt = `You are a helpful home cooking assistant. Generate a recipe based on the user's available ingredients. Prioritize ingredients that are expiring soon, and prefer items that are on sale when provided. Follow ALL constraints exactly. Return JSON only, no markdown.

Return format:
{
  "title": "Recipe Name",
  "description": "Brief description",
  "prep_time": 10,
  "cook_time": 20,
  "instructions": "Step-by-step instructions as a single string with numbered steps",
  "calories": 520,
  "protein_g": 35,
  "carbs_g": 40,
  "fat_g": 18,
  "fiber_g": 9,
  "build": { "pro": ["..."], "base": ["..."], "veg": ["..."], "engine": ["..."] },
  "ingredients": [
    { "name": "ingredient", "quantity": 1, "unit": "cup", "base_ingredient": "normalized name" }
  ]
}
Macros are realistic per-serving integers (fiber_g always included). "build" is the 4-pillar breakdown: pro=protein, base=complex carb, veg=vegetable, engine=signature flavor.`

    let userPrompt = `Available ingredients: ${ingredients.join(', ')}`
    if (expiringItems?.length) userPrompt += `\n\nExpiring soon (prioritize these!): ${expiringItems.join(', ')}`
    if (onSaleItems?.length) userPrompt += `\n\nOn sale this week (prefer these): ${onSaleItems.join(', ')}`
    if (mood) userPrompt += `\n\nMood/craving: ${mood}`
    if (maxTime) userPrompt += `\n\nMax total time: ${maxTime} minutes`
    if (cuisine) userPrompt += `\n\nCuisine preference: ${cuisine}`
    if (Array.isArray(constraints) && constraints.length) {
      userPrompt += `\n\nConstraints (follow all):\n${constraints.map((c: string) => `- ${c}`).join('\n')}`
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
        max_tokens: 1536,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    const result = await response.json()

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let text = result.content?.[0]?.text || '{}'
    text = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim()

    // Validate parsed JSON has expected fields
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(text)
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to parse recipe JSON from model response' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!parsed.title || !parsed.instructions || !Array.isArray(parsed.ingredients)) {
      return new Response(JSON.stringify({ error: 'Model response missing required recipe fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
