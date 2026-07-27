import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Thin fetch-proxy: browsers can't fetch a recipe page cross-origin (no CORS), so
// this fetches server-side and returns just the JSON-LD script blocks. The client
// parses them with the shared, unit-tested parseLdJsonBlocks — single source of
// truth for parsing. No credentials, no storage; the user pastes a URL they chose.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    const { url } = await req.json()
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return new Response(JSON.stringify({ error: 'A valid http(s) URL is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    const html = await res.text()
    const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
      .map((m) => m[1].trim())
      .filter(Boolean)

    return new Response(JSON.stringify({ blocks, finalUrl: res.url, status: res.status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
