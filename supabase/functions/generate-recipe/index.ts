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
    const { ingredients, expiringItems, mood, maxTime, cuisine } = await req.json()

    const systemPrompt = `You are a helpful home cooking assistant. Generate a recipe based on the user's available ingredients. Prioritize ingredients that are expiring soon. Return JSON only, no markdown.

Return format:
{
  "title": "Recipe Name",
  "description": "Brief description",
  "prep_time": 10,
  "cook_time": 20,
  "instructions": "Step-by-step instructions as a single string with numbered steps",
  "ingredients": [
    { "name": "ingredient", "quantity": 1, "unit": "cup", "base_ingredient": "normalized name" }
  ]
}`

    let userPrompt = `Available ingredients: ${ingredients.join(', ')}`
    if (expiringItems?.length) userPrompt += `\n\nExpiring soon (prioritize these!): ${expiringItems.join(', ')}`
    if (mood) userPrompt += `\n\nMood/craving: ${mood}`
    if (maxTime) userPrompt += `\n\nMax total time: ${maxTime} minutes`
    if (cuisine) userPrompt += `\n\nCuisine preference: ${cuisine}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
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
