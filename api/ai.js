/* global process, Buffer */ // Berjalan di Node (Vercel Function), bukan di browser.
// Gerbang AI di server (Vercel Function).
//
// Kunci API AI hanya ada di server (env SUMOPOD_API_KEY), tidak pernah dikirim ke browser.
// Hanya pengguna yang sedang login di SYSTRACT (token Supabase valid) yang boleh memakai.
//
// Mode:
//   - default : memakai kunci SYSTRACT (SUMOPOD_API_KEY / SUMOPOD_API_URL).
//   - byok    : pengguna membawa kunci & URL sendiri (endpoint kompatibel OpenAI).
//               Hanya https, hanya ke /chat/completions, dan bukan alamat jaringan lokal.

const DEFAULT_URL = 'https://ai.sumopod.com/v1'
const SERVER_MODELS = ['deepseek-v4-flash']
const MAX_BODY_CHARS = 400_000

async function verifyUser(req) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return false
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return false
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  })
  return r.ok
}

function isPublicHttpsUrl(raw) {
  let u
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'https:') return false
  const h = u.hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return false
  // Tolak alamat IP langsung (IPv4/IPv6) agar tidak dipakai menjangkau jaringan internal.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':') || h.startsWith('[')) return false
  return true
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    if (!(await verifyUser(req))) {
      return res.status(401).json({ error: 'Silakan masuk terlebih dahulu.' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const { messages, model, response_format, stream, temperature, max_tokens, byok } = body

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages wajib diisi.' })
    }
    if (JSON.stringify(messages).length > MAX_BODY_CHARS) {
      return res.status(413).json({ error: 'Permintaan terlalu besar.' })
    }

    let baseUrl
    let apiKey
    let modelToUse
    if (byok) {
      if (!byok.key || !isPublicHttpsUrl(byok.url)) {
        return res.status(400).json({ error: 'URL AI harus https dan bukan alamat lokal.' })
      }
      baseUrl = byok.url.replace(/\/+$/, '')
      apiKey = byok.key
      modelToUse = model
    } else {
      apiKey = process.env.SUMOPOD_API_KEY
      if (!apiKey) {
        return res.status(500).json({ error: 'Kunci AI server belum dikonfigurasi (SUMOPOD_API_KEY).' })
      }
      baseUrl = (process.env.SUMOPOD_API_URL || DEFAULT_URL).replace(/\/+$/, '')
      modelToUse = SERVER_MODELS.includes(model) ? model : SERVER_MODELS[0]
    }

    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelToUse,
        messages,
        ...(response_format ? { response_format } : {}),
        ...(typeof temperature === 'number' ? { temperature } : {}),
        ...(typeof max_tokens === 'number' ? { max_tokens } : {}),
        stream: Boolean(stream),
      }),
    })

    if (!upstream.ok || !stream || !upstream.body) {
      const text = await upstream.text()
      res.status(upstream.status)
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      return res.send(text)
    }

    // Teruskan stream SSE apa adanya ke browser.
    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    const reader = upstream.body.getReader()
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
    return res.end()
  } catch (err) {
    console.error('[api/ai]', err)
    if (!res.headersSent) return res.status(500).json({ error: 'Gagal menghubungi layanan AI.' })
    return res.end()
  }
}
