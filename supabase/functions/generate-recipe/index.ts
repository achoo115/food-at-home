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
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  const result = await response.json()
  const text = result.content?.[0]?.text || '{}'

  return new Response(text, {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
