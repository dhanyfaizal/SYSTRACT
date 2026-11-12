// Berjalan di Node (Vercel Function), bukan di browser.
// Gerbang AI di server (Vercel Function).
//
// Kunci API AI hanya ada di server (env SUMOPOD_API_KEY), tidak pernah dikirim ke browser.
// AI dipakai di sisi instruktur (penyusunan RPS, CPMK, slide, soal): hanya pengguna yang login
// dengan peran dosen atau admin yang boleh memakai. Peserta tidak punya akses AI.

const DEFAULT_URL = 'https://ai.sumopod.com/v1'
// Model dikunci di kode: hanya model murah ini yang boleh dipakai dengan kunci SYSTRACT.
// Variabel lingkungan (SUMOPOD_MODEL dsb.) dan isi permintaan browser TIDAK bisa mengganti model,
// supaya anggaran tidak terkuras oleh model mahal. Ubah daftar ini hanya dengan sengaja.
const MODEL_DIIZINKAN = ['deepseek-v4-flash']
const MAX_BODY_CHARS = 400_000

// Ke browser, AI selalu tampil sebagai AISYS (Akal Imitasi STIKOM Yos Sudarso): nama model dan
// penyedia asli tidak ikut terkirim (respons, potongan stream, maupun pesan error).
const NAMA_AI = 'AISYS'
const escRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const POLA_NAMA_ASLI = new RegExp([...MODEL_DIIZINKAN.map(escRegex), 'deepseek[\\w.:/-]*', 'sumopod', 'litellm'].join('|'), 'gi')
export const samarkan = (teks) => String(teks).replace(POLA_NAMA_ASLI, NAMA_AI)

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
    // Pengguna maupun pengaturan Vercel tidak bisa memilih model lain dengan kunci SYSTRACT.
    if (process.env.SUMOPOD_MODEL && !MODEL_DIIZINKAN.includes(process.env.SUMOPOD_MODEL)) {
      console.warn(`[api/ai] SUMOPOD_MODEL="${process.env.SUMOPOD_MODEL}" diabaikan; hanya ${MODEL_DIIZINKAN.join(', ')} yang diizinkan.`)
    }
    const modelsToTry = MODEL_DIIZINKAN

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
      const content = samarkan(data?.choices?.[0]?.message?.content || '')
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
      return res.send(samarkan(text))
    }

    // Teruskan stream SSE ke browser per baris utuh (nama tidak terpotong antarpotongan), disamarkan.
    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    const reader = upstream.body.getReader()
    const dekoder = new TextDecoder()
    let sisa = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      sisa += dekoder.decode(value, { stream: true })
      const akhirBaris = sisa.lastIndexOf('\n')
      if (akhirBaris < 0) continue
      res.write(samarkan(sisa.slice(0, akhirBaris + 1)))
      sisa = sisa.slice(akhirBaris + 1)
    }
    sisa += dekoder.decode()
    if (sisa) res.write(samarkan(sisa))
    return res.end()
  } catch (err) {
    console.error('[api/ai]', err)
    if (!res.headersSent) return res.status(500).json({ error: 'Gagal menghubungi layanan AI.' })
    return res.end()
  }
}
