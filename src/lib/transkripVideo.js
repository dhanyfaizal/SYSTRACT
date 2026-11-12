// Transkrip video (ditempel dosen dari tombol "Tampilkan transkrip" YouTube) → bahan soal AI.
//
// Format yang dikenali:
//   1) YouTube, cap waktu di baris sendiri:   "0:05\nteks...\n0:12\nteks..."
//   2) YouTube, cap waktu sebaris:            "0:05 teks..."  /  "1:02:05 teks..."
//   3) SRT / VTT:                             "00:00:05,000 --> 00:00:08,000\nteks"
//   4) YouTube (salinan panel transkrip baru): cap waktu + label pembaca layar menempel ke teks,
//      mis. "0:1212 secondsA broadcast..." atau "1:011 menit, 1 detikTeks...".
// Video tidak pernah diunduh: hanya teks yang ditempel dosen yang dikirim ke AI.

import { bacaDetik, formatDetik, saranJumlahSoal, rapikanSoal } from './videoInteraktif.js'

const CAP = /^(\d{1,2}:)?\d{1,2}:\d{2}$/
const CAP_DEPAN = /^((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+)$/
const SRT = /^(\d{2}):(\d{2}):(\d{2})[,.]\d{1,3}\s*-->/
const CAP_LABEL = /^((?:\d{1,2}:)?\d{1,2}:\d{2})\s*(\d.*)$/
const BAGIAN_LABEL = /^(\d+)\s*(hours|hour|minutes|minute|seconds|second|jam|menit|detik)/i
const NILAI_SATUAN = { hour: 3600, hours: 3600, jam: 3600, minute: 60, minutes: 60, menit: 60, second: 1, seconds: 1, detik: 1 }

/**
 * Buang label pembaca layar YouTube ("1 minute, 6 seconds" / "1 menit, 6 detik") di awal `sisa`.
 * Label hanya dibuang bila nilainya sama dengan cap waktu, agar teks materi tidak ikut terpotong.
 * @returns {string|null} teks setelah label, atau null bila tidak ada label yang cocok
 */
export function buangLabelSuara(sisa, detik) {
  let rest = String(sisa || '')
  let total = 0
  for (;;) {
    const m = rest.match(BAGIAN_LABEL)
    if (!m) return null
    total += Number(m[1]) * NILAI_SATUAN[m[2].toLowerCase()]
    rest = rest.slice(m[0].length)
    if (total === detik) return rest.trim()
    const koma = rest.match(/^,?\s*(?=\d)/)
    if (!koma) return null
    rest = rest.slice(koma[0].length)
  }
}

/** @returns {{ detik: number, teks: string }[]} segmen berurutan */
export function uraiTranskrip(teks) {
  const baris = String(teks || '').replace(/\r/g, '').split('\n').map((b) => b.trim())
  const hasil = []
  let aktif = null
  const tutup = () => { if (aktif && aktif.teks.trim()) hasil.push({ detik: aktif.detik, teks: aktif.teks.trim() }); aktif = null }

  for (const b of baris) {
    if (!b || b === 'WEBVTT' || /^\d+$/.test(b)) continue // baris kosong, kepala VTT, nomor urut SRT
    const srt = b.match(SRT)
    if (srt) { tutup(); aktif = { detik: Number(srt[1]) * 3600 + Number(srt[2]) * 60 + Number(srt[3]), teks: '' }; continue }
    if (CAP.test(b)) { tutup(); aktif = { detik: bacaDetik(b), teks: '' }; continue }
    // Label pembaca layar di baris sendiri tepat setelah cap waktu ("0:05" lalu "5 seconds").
    if (aktif && !aktif.teks && buangLabelSuara(b, aktif.detik) === '') continue
    const berlabel = b.match(CAP_LABEL)
    if (berlabel) {
      const d = bacaDetik(berlabel[1])
      const sisa = buangLabelSuara(berlabel[2], d)
      if (sisa !== null) { tutup(); aktif = { detik: d, teks: sisa }; continue }
    }
    const depan = b.match(CAP_DEPAN)
    if (depan) { tutup(); aktif = { detik: bacaDetik(depan[1]), teks: depan[2] }; continue }
    if (aktif) aktif.teks += ` ${b}`
  }
  tutup()
  return hasil.filter((s) => Number.isFinite(s.detik)).sort((a, b) => a.detik - b.detik)
}

const tulisBaris = (daftar, maksKarakter) => {
  let keluaran = ''
  for (const g of daftar) {
    const b = `[${formatDetik(g.detik)}] ${g.teks.replace(/\s+/g, ' ')}\n`
    if (keluaran.length + b.length > maksKarakter) break
    keluaran += b
  }
  return keluaran
}

/**
 * Transkrip untuk prompt: "[m:ss] teks" per segmen. Cap waktu tiap segmen dipertahankan agar AI
 * bisa menaruh soal tepat setelah gagasan selesai; segmen baru digabung per ±20 detik bila
 * transkrip terlalu panjang, lalu dipotong bila masih melebihi batas (video sangat panjang).
 */
export function transkripUntukAi(segmen, maksKarakter = 60000) {
  const utuh = segmen.reduce((n, s) => n + s.teks.length + 10, 0)
  if (utuh <= maksKarakter) return tulisBaris(segmen, maksKarakter)
  const gabung = []
  for (const s of segmen) {
    const akhir = gabung[gabung.length - 1]
    if (akhir && s.detik - akhir.detik < 20) akhir.teks += ` ${s.teks}`
    else gabung.push({ ...s })
  }
  return tulisBaris(gabung, maksKarakter)
}

/** Jumlah soal yang diminta dari AI untuk durasi tertentu. */
export const jumlahSoalAi = (durasiDetik) => saranJumlahSoal(durasiDetik) || 1

const JARAK_MIN = 20 // detik antarsoal agar video tidak berhenti terlalu rapat

/**
 * Normalkan hasil AI menjadi soal editor: detik dibatasi ke rentang transkrip/video,
 * soal yang terlalu rapat atau tidak lengkap dibuang, jawaban berupa huruf diterima.
 */
export function normalkanSoalAi(hasil, { durasi = 0 } = {}) {
  const daftar = Array.isArray(hasil?.soal) ? hasil.soal : Array.isArray(hasil) ? hasil : []
  const batas = durasi > 0 ? Math.floor(durasi) - 1 : Infinity
  const mentah = daftar.map((s) => {
    const opsi = (Array.isArray(s?.opsi) ? s.opsi : []).slice(0, 4).map((o) => String(o ?? '').replace(/^[A-D][.)]\s*/, '').trim())
    let jawaban = s?.jawaban
    if (typeof jawaban === 'string') jawaban = /^[A-D]$/i.test(jawaban.trim()) ? 'ABCD'.indexOf(jawaban.trim().toUpperCase()) : Number(jawaban)
    const detik = typeof s?.detik === 'string' ? bacaDetik(s.detik) : Number(s?.detik)
    if (!Number.isFinite(detik) || detik < 1) return null // tanpa detik yang jelas: buang
    return {
      detik: Math.min(batas, Math.round(detik)),
      pertanyaan: String(s?.pertanyaan ?? '').trim(),
      opsi: [...opsi, '', '', '', ''].slice(0, 4),
      jawaban: Number.isInteger(jawaban) ? jawaban : 0,
      penjelasan: String(s?.penjelasan ?? '').trim(),
    }
  })
  const rapi = rapikanSoal(mentah.filter(Boolean)).map((s) => ({ ...s, opsi: [...s.opsi, '', '', '', ''].slice(0, 4) }))
  const terpilih = []
  for (const s of rapi) {
    if (!Number.isFinite(s.detik) || s.detik < 1) continue
    if (terpilih.length && s.detik - terpilih[terpilih.length - 1].detik < JARAK_MIN) continue
    terpilih.push(s)
  }
  return terpilih
}
