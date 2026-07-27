import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BUCKET = 'recipe-images'
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
}

async function sha16(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Download an image from a source URL server-side and store a permanent copy in
// the public recipe-images bucket. Returns the stored public URL. Idempotent by
// URL hash. On any fetch/upload failure the client keeps the original hotlink.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    const { url } = await req.json()
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return new Response(JSON.stringify({ error: 'valid image url required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', Accept: 'image/*' } })
    const contentType = (res.headers.get('content-type') || '').split(';')[0].toLowerCase()
    if (!res.ok || !contentType.startsWith('image/')) {
      return new Response(JSON.stringify({ error: `source not an image (${res.status} ${contentType})` }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    const path = `${await sha16(url)}.${EXT[contentType] || 'jpg'}`

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true })
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { data } = db.storage.from(BUCKET).getPublicUrl(path)
    return new Response(JSON.stringify({ url: data.publicUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
