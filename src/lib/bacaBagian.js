// Waktu baca minimal per bagian SPA, dihitung dari isi slide (bukan angka tetap).
//
// - Kecepatan baca belajar ±200 kata/menit; minimal 8 detik, maksimal 90 detik per bagian.
// - Bagian berisi tabel, langkah, atau angka kunci +10 detik karena perlu dicermati.
// - Bagian video dan latihan tidak punya waktu baca: keduanya dijaga oleh soal masing-masing.
// - Sampul/penutup cukup terlihat sebentar.

export const KATA_PER_MENIT = 200
export const DETIK_BAGIAN_MIN = 8
export const DETIK_BAGIAN_MAKS = 90
const TAMBAHAN_CERMAT = 10
const LAYOUT_CERMAT = new Set(['table', 'steps', 'stats'])
const LAYOUT_TANPA_BACA = new Set(['media', 'quiz'])
const LAYOUT_SINGKAT = new Set(['cover', 'thank_you'])
const KUNCI_BUKAN_TEKS = new Set(['image_url', 'layout', 'icon', 'color', 'media_hint', 'soal_video', 'slide_no', 'answer'])

/** Teks polos sebuah slide (semua isian teks, tanpa tag HTML, URL, atau metadata). */
export function teksSlide(slide) {
  const keping = []
  const jelajah = (v, kunci) => {
    if (KUNCI_BUKAN_TEKS.has(kunci)) return
    if (Array.isArray(v)) v.forEach((x) => jelajah(x, kunci))
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => jelajah(x, k))
    else if (typeof v === 'string') keping.push(v.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' '))
  }
  jelajah(slide || {}, '')
  return keping.join(' ').replace(/\s+/g, ' ').trim()
}

export const hitungKata = (teks) => (String(teks || '').match(/[\p{L}\p{N}]+/gu) || []).length

/** Detik baca minimal untuk satu bagian; 0 = bagian ini tidak wajib dibaca dengan waktu. */
export function targetBacaBagian(slide) {
  const layout = slide?.layout
  if (LAYOUT_TANPA_BACA.has(layout)) return 0
  if (LAYOUT_SINGKAT.has(layout)) return 4
  const dasar = (hitungKata(teksSlide(slide)) / KATA_PER_MENIT) * 60
  const tambah = LAYOUT_CERMAT.has(layout) ? TAMBAHAN_CERMAT : 0
  return Math.round(Math.min(DETIK_BAGIAN_MAKS, Math.max(DETIK_BAGIAN_MIN, dasar + tambah)))
}

/** Total detik baca minimal seluruh SPA (untuk ditampilkan ke peserta/dosen). */
export const totalBaca = (slides) => (slides || []).reduce((n, s) => n + targetBacaBagian(s), 0)

/**
 * Apakah sebuah bagian sedang "dibaca": cukup banyak bagian itu yang terlihat di panel.
 * Bagian pendek harus terlihat ≥60%; bagian panjang cukup mengisi ≥40% tinggi panel.
 */
export function bagianTerlihat(rectBagian, rectPanel) {
  const atas = Math.max(rectBagian.top, rectPanel.top)
  const bawah = Math.min(rectBagian.bottom, rectPanel.bottom)
  const terlihat = Math.max(0, bawah - atas)
  if (terlihat <= 0) return false
  return terlihat >= Math.min(rectBagian.height * 0.6, rectPanel.height * 0.4)
}
