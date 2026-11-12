// Alat "Lengkapi beban & CPMK": kumpulkan semua aktivitas kursus (materi, tugas, ujian, forum),
// perkirakan menit belajar dari isinya, terima saran AI, lalu hitung ulang total & cakupan CPMK
// dengan aturan yang sama seperti RPC ringkasan_beban_belajar.

import { totalBaca } from '@/lib/bacaBagian'
import { urlVideoValid } from '@/lib/sisipSlide'
import { tebakJenisMateri, targetMenit } from '@/lib/bebanBelajar'

export const MENIT_MAKS = 6000

/** Faktor belajar: waktu baca minimum dikali 2 (memahami, mencatat, membaca ulang). */
const FAKTOR_BELAJAR = 2
const DETIK_VIDEO_BAWAAN = 600       // video tanpa soal: anggap 10 menit
const DETIK_PER_SOAL_VIDEO = 30
const DETIK_PER_SOAL_LATIHAN = 60
const DETIK_DISKUSI = 300            // pertanyaan pemantik: merenung & mencatat jawaban

export const bulat5 = (menit) => Math.min(MENIT_MAKS, Math.max(5, Math.ceil((Number(menit) || 0) / 5) * 5))

/**
 * Perkiraan menit belajar satu materi dari isi SPA-nya.
 * @returns {{ menit: number, jenis: 'video'|'bacaan', rincian: string } | null} null bila bukan SPA.
 */
export function estimasiMateri(materi) {
  const slides = materi?.webslide_content?.slides
  if (!Array.isArray(slides) || !slides.length) return null

  const baca = totalBaca(slides) * FAKTOR_BELAJAR
  let video = 0, jumlahVideo = 0, soal = 0, diskusi = 0
  for (const s of slides) {
    if (s?.layout === 'media' && urlVideoValid(s.image_url)) {
      jumlahVideo++
      const sv = Array.isArray(s.soal_video) ? s.soal_video : []
      const akhir = sv.reduce((m, q) => Math.max(m, Number(q?.detik) || 0), 0)
      video += akhir ? akhir + 60 : DETIK_VIDEO_BAWAAN
      soal += sv.length * DETIK_PER_SOAL_VIDEO
    }
    if (s?.layout === 'quiz') soal += (Array.isArray(s.quiz_items) ? s.quiz_items.length : 0) * DETIK_PER_SOAL_LATIHAN
    if (s?.layout === 'discussion') diskusi += DETIK_DISKUSI
  }
  video = Math.round(video * 1.2) // jeda, putar ulang

  const bagian = [
    `baca ${Math.round(baca / 60)} mnt`,
    jumlahVideo ? `${jumlahVideo} video ${Math.round(video / 60)} mnt` : '',
    soal ? `soal ${Math.round(soal / 60)} mnt` : '',
    diskusi ? `diskusi ${Math.round(diskusi / 60)} mnt` : '',
  ].filter(Boolean)

  return {
    menit: bulat5((baca + video + soal + diskusi) / 60),
    jenis: video > baca ? 'video' : 'bacaan',
    rincian: bagian.join(' + '),
  }
}

const potong = (t, n) => {
  const s = String(t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** Satu baris tabel per aktivitas, urut pekan lalu jenis. */
export function barisAktivitas({ materials = [], assignments = [], exams = [], forums = [] }) {
  const baris = []
  for (const m of materials) {
    const auto = estimasiMateri(m)
    const lampiran = m.attachments?.length ? m.attachments : [{ url: m.webview_link, mime: m.mime_type }]
    baris.push({
      kunci: `materials:${m.id}`, tabel: 'materials', id: m.id, kategori: 'materi',
      judul: m.title || 'Materi', deskripsi: potong(m.description, 220), pekan: +m.week_number || 0,
      menit: m.estimasi_menit ?? null, jenisMateri: m.jenis_aktivitas || null,
      jenisTebakan: auto?.jenis || tebakJenisMateri(lampiran),
      cpmk: [...(m.cpmk_kode || [])], otomatis: auto,
    })
  }
  for (const a of assignments) {
    baris.push({
      kunci: `assignments:${a.id}`, tabel: 'assignments', id: a.id, kategori: 'tugas',
      judul: a.title || 'Tugas', deskripsi: potong(a.description, 220), pekan: null,
      menit: a.estimasi_menit ?? null, cpmk: [...(a.cpmk_kode || [])], otomatis: null,
    })
  }
  for (const e of exams) {
    const ujian = (e.exam_mode || 'ujian') === 'ujian'
    baris.push({
      kunci: `exams:${e.id}`, tabel: 'exams', id: e.id, kategori: ujian ? 'evaluasi' : 'kuis',
      judul: e.title || 'Ujian', deskripsi: potong(`${e.type || ''} ${e.duration_minutes ? `${e.duration_minutes} menit` : ''}`, 120), pekan: null,
      menit: e.estimasi_menit ?? null, durasi: e.duration_minutes ?? null,
      cpmk: [...(e.cpmk_kode || [])], otomatis: null,
    })
  }
  for (const f of forums) {
    baris.push({
      kunci: `forums:${f.id}`, tabel: 'forums', id: f.id, kategori: 'forum',
      judul: f.title || 'Forum', deskripsi: potong(f.body, 220), pekan: null,
      menit: f.estimasi_menit ?? null, cpmk: [...(f.cpmk_kode || [])], otomatis: null,
    })
  }
  const urutKategori = { materi: 0, forum: 1, tugas: 2, kuis: 3, evaluasi: 4 }
  return baris.sort((a, b) => (urutKategori[a.kategori] - urutKategori[b.kategori]) || ((a.pekan ?? 99) - (b.pekan ?? 99)))
}

/** Menit yang dihitung server untuk satu baris (ujian kosong → durasi ujian). */
export const menitTerhitung = (b) => b.menit ?? (b.tabel === 'exams' ? b.durasi ?? null : null)

/** Total & cakupan CPMK, sama dengan ringkasan_beban_belajar. */
export function ringkasBaris(baris, cpmkList = [], sks = 0) {
  let total = 0, belum = 0
  for (const b of baris) {
    const m = menitTerhitung(b)
    if (m == null) belum++
    else total += m
  }
  const cakupan = cpmkList.map((c) => {
    const terkait = baris.filter((b) => b.cpmk.includes(c.kode))
    return { kode: c.kode, deskripsi: c.deskripsi, jumlah: terkait.length, menit: terkait.reduce((n, b) => n + (menitTerhitung(b) || 0), 0) }
  })
  return { totalMenit: total, belumDiisi: belum, targetMenit: targetMenit(sks), cakupan }
}

/** Data ringkas untuk AI: kunci pendek (a1, a2, …) agar respons hemat & mudah dipetakan balik. */
export function dataUntukAi(baris) {
  return baris.map((b, i) => ({
    id: `a${i + 1}`,
    jenis: b.kategori,
    ...(b.pekan ? { pekan: b.pekan } : {}),
    judul: potong(b.judul, 160),
    ...(b.deskripsi ? { ringkasan: b.deskripsi } : {}),
    ...(b.otomatis ? { menit_dari_isi: b.otomatis.menit } : {}),
    ...(b.tabel === 'exams' && b.durasi ? { durasi_ujian: b.durasi } : {}),
  }))
}

/**
 * Rapikan jawaban AI: hanya id yang dikenal, hanya kode CPMK yang ada, menit wajar.
 * @returns {Map<string, { cpmk: string[], menit: number|null, alasan: string }>} per kunci baris
 */
export function normalkanSaranAi(res, baris, kodeValid) {
  const valid = new Set(kodeValid)
  const daftar = Array.isArray(res) ? res : Array.isArray(res?.aktivitas) ? res.aktivitas : []
  const hasil = new Map()
  for (const s of daftar) {
    const idx = /^a(\d+)$/.exec(String(s?.id || '').trim())
    const b = idx && baris[+idx[1] - 1]
    if (!b) continue
    const cpmk = [...new Set((Array.isArray(s.cpmk) ? s.cpmk : []).map((k) => String(k).trim().toUpperCase()))]
      .filter((k) => valid.has(k)).slice(0, 3)
    const m = Number(s.menit)
    hasil.set(b.kunci, {
      cpmk,
      menit: Number.isFinite(m) && m > 0 ? bulat5(m) : null,
      alasan: potong(s.alasan, 160),
    })
  }
  return hasil
}

/**
 * Terapkan saran ke baris. Yang sudah terisi tidak ditimpa kecuali `timpa`.
 * Menit dari isi SPA lebih dipercaya daripada tebakan AI.
 */
export function terapkanSaran(baris, saran, { timpa = false } = {}) {
  return baris.map((b) => {
    const s = saran.get(b.kunci)
    if (!s) return b
    const baru = { ...b, alasanAi: s.alasan }
    if ((timpa || !b.cpmk.length) && s.cpmk.length) { baru.cpmk = s.cpmk; baru.sumberCpmk = 'ai' }
    if (timpa || b.menit == null) {
      if (b.otomatis) { baru.menit = b.otomatis.menit; baru.sumberMenit = 'isi' }
      else if (s.menit != null) { baru.menit = s.menit; baru.sumberMenit = 'ai' }
    }
    return baru
  })
}

/** Isi menit kosong dari isi SPA (tanpa AI). */
export function isiMenitOtomatis(baris, { timpa = false } = {}) {
  return baris.map((b) => (b.otomatis && (timpa || b.menit == null) ? { ...b, menit: b.otomatis.menit, sumberMenit: 'isi' } : b))
}

const samaArr = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

/** Daftar perubahan untuk disimpan: [{ tabel, id, patch }]. */
export function daftarPerubahan(baris, awal) {
  const lama = new Map(awal.map((b) => [b.kunci, b]))
  const out = []
  for (const b of baris) {
    const a = lama.get(b.kunci)
    if (!a) continue
    const patch = {}
    if (b.menit !== a.menit) patch.estimasi_menit = b.menit
    if (!samaArr([...b.cpmk].sort(), [...a.cpmk].sort())) patch.cpmk_kode = b.cpmk
    if (b.tabel === 'materials' && b.jenisMateri !== a.jenisMateri) patch.jenis_aktivitas = b.jenisMateri
    if (Object.keys(patch).length) out.push({ tabel: b.tabel, id: b.id, patch })
  }
  return out
}
