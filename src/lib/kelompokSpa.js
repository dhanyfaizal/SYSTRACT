// Konversi outline → SPA dipecah per kelompok bagian, agar materi panjang (26–34 bagian)
// tidak terpotong batas panjang jawaban AI dan bisa diproses paralel.

import { spaDariSlideKonten } from '@/lib/sisipSlide'

export const UKURAN_KELOMPOK = 12

/** Bagi slide outline menjadi kelompok berurutan; sisa kecil (< 4) digabung ke kelompok sebelumnya. */
export function kelompokkanSlide(slides = [], ukuran = UKURAN_KELOMPOK) {
  const out = []
  for (let i = 0; i < slides.length; i += ukuran) out.push(slides.slice(i, i + ukuran))
  if (out.length > 1 && out[out.length - 1].length < 4) out[out.length - 2].push(...out.pop())
  return out
}

/**
 * Gabungkan hasil SPA per kelompok mengikuti urutan outline.
 * Slide yang tidak dikembalikan AI diganti bentuk daftar sederhana agar tidak ada materi yang hilang.
 * @returns {{ slides: object[], hilang: number[] }}
 */
export function gabungSpa(outlineSlides = [], hasilKelompok = []) {
  const peta = new Map()
  for (const h of hasilKelompok) {
    for (const s of Array.isArray(h?.slides) ? h.slides : []) {
      const no = Number(s?.slide_no)
      if (Number.isFinite(no) && !peta.has(no)) peta.set(no, { ...s, slide_no: no })
    }
  }
  const hilang = []
  const slides = outlineSlides.map((o) => {
    const s = peta.get(Number(o.slide_no))
    if (s) return s
    hilang.push(o.slide_no)
    return spaDariSlideKonten(o)
  })
  return { slides, hilang }
}
