// Berjalan di Node (Vercel Function), bukan di browser.
// Gerbang AI di server (Vercel Function).
//
// Kunci API AI hanya ada di server (env SUMOPOD_API_KEY), tidak pernah dikirim ke browser.
// AI dipakai di sisi instruktur (penyusunan RPS, CPMK, slide, soal): hanya pengguna yang login
// dengan peran dosen atau admin yang boleh memakai. Peserta tidak punya akses AI.

const DEFAULT_URL = 'https://ai.sumopod.com/v1'
// Model server: utama SUMOPOD_MODEL, cadangan SUMOPOD_FALLBACK_MODEL (env); bila kosong, default di bawah.
// Cadangan dipakai otomatis bila model utama gagal di sisi penyedia.
const DEFAULT_MODEL = 'deepseek-v4-flash'
const FALLBACK_MODEL = 'deepseek-flash'
const MAX_BODY_CHARS = 400_000

const PERAN_AI = ['dosen', 'admin']

// 'ok' | 'belum_login' | 'bukan_instruktur'
async function periksaPengguna(req) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return 'belum_login'
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return 'belum_login'
  const hdr = { apikey: anonKey, Authorization: `Bearer ${token}` }
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: hdr })
  if (!r.ok) return 'belum_login'
  const { id } = await r.json()
  // Peran dibaca dengan token pengguna itu sendiri (RLS profiles mengizinkan membaca profil).
  const pr = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=role`, { headers: hdr })
  if (!pr.ok) return 'bukan_instruktur'
  const [profil] = await pr.json()
  return PERAN_AI.includes(profil?.role) ? 'ok' : 'bukan_instruktur'
}

// Gabungkan pesan sistem ke pesan pengguna untuk model yang tidak menerima peran "system".
function mergeSystem(messages) {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const rest = messages.filter((m) => m.role !== 'system')
  if (!sys || rest.length === 0) return rest.length ? rest : messages
  const [first, ...others] = rest
  return [{ ...first, content: `${sys}\n\n${first.content}` }, ...others]
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const akses = await periksaPengguna(req)
    if (akses === 'belum_login') return res.status(401).json({ error: 'Silakan masuk terlebih dahulu.' })
    if (akses !== 'ok') return res.status(403).json({ error: 'Fitur AI hanya tersedia untuk instruktur.' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const { messages, response_format, stream, temperature, max_tokens } = body

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages wajib diisi.' })
    }
    if (JSON.stringify(messages).length > MAX_BODY_CHARS) {
      return res.status(413).json({ error: 'Permintaan terlalu besar.' })
    }

    const apiKey = process.env.SUMOPOD_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'Kunci AI server belum dikonfigurasi (SUMOPOD_API_KEY).' })
    }
    const baseUrl = (process.env.SUMOPOD_API_URL || DEFAULT_URL).replace(/\/+$/, '')
    // Pengguna tidak bisa memilih model lain dengan kunci SYSTRACT.
    const modelsToTry = [...new Set([
      process.env.SUMOPOD_MODEL || DEFAULT_MODEL,
      process.env.SUMOPOD_FALLBACK_MODEL || FALLBACK_MODEL,
    ])]

    // Penyedia (LiteLLM di Sumopod) kadang memetakan model ke versi yang menolak parameter
    // tertentu ("Invalid param: not support for model"). Bila itu terjadi, coba ulang dengan
    // permintaan yang makin sederhana. Respons tetap JSON karena prompt meminta JSON murni,
    // dan klien sudah membuang pembungkus ```json.
    const attempts = [
      { response_format, temperature, max_tokens, messages },
      { temperature, max_tokens, messages },
      { messages: mergeSystem(messages) },
      { messages: mergeSystem(messages), noStream: true },
    ]
    let upstream
    let usedNoStream = false
    for (let m = 0; m < modelsToTry.length; m++) {
      const modelToUse = modelsToTry[m]
      for (let i = 0; i < attempts.length; i++) {
        const a = attempts[i]
        upstream = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: modelToUse,
            messages: a.messages,
            ...(a.response_format ? { response_format: a.response_format } : {}),
            ...(typeof a.temperature === 'number' ? { temperature: a.temperature } : {}),
            ...(typeof a.max_tokens === 'number' ? { max_tokens: a.max_tokens } : {}),
            stream: Boolean(stream) && !a.noStream,
          }),
        })
        usedNoStream = Boolean(a.noStream)
        if (upstream.status !== 400 || i === attempts.length - 1) break
        const errText = await upstream.clone().text()
        if (!/invalid param|not support|unsupported|unknown parameter/i.test(errText)) break
        console.warn(`[api/ai] ${modelToUse}: percobaan ${i + 1} ditolak (parameter), mencoba lebih sederhana`)
      }
      // Pindah ke model cadangan bila model ini gagal karena sisi penyedia
      // (parameter ditolak, model tidak ada, kuota/limit, atau server error).
      const gagalPenyedia = upstream.status === 400 || upstream.status === 404 || upstream.status === 429 || upstream.status >= 500
      if (upstream.ok || !gagalPenyedia || m === modelsToTry.length - 1) break
      console.warn(`[api/ai] ${modelToUse} gagal (HTTP ${upstream.status}), beralih ke ${modelsToTry[m + 1]}`)
    }

    // Cadangan terakhir dipanggil tanpa stream; kirim ulang ke browser sebagai satu potong SSE
    // agar klien (yang membaca stream) tetap bekerja.
    if (upstream.ok && stream && usedNoStream) {
      const data = await upstream.json()
      const content = data?.choices?.[0]?.message?.content || ''
      res.status(200)
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`)
      res.write('data: [DONE]\n\n')
      return res.end()
    }

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
