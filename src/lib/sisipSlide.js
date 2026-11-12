// Menyisipkan slide di antara outline yang sudah ada, termasuk slide video.
//
// Outline (langkah 1) dan SPA (langkah 2) dipasangkan lewat urutan/slide_no, jadi setiap
// penyisipan dilakukan di kedua daftar sekaligus lalu keduanya diberi nomor ulang.
// Slide video di outline ditandai `jenis: 'video'` dan di SPA selalu memakai layout "media"
// (tidak perlu AI: tampilannya sudah pasti satu pemutar video satu layar).

import { youtubeId } from './spaBlocks.js'
import { rapikanSoal } from './videoInteraktif.js'

export const JENIS_SLIDE = { konten: 'konten', video: 'video' }

/** URL yang bisa diputar sebagai video: YouTube atau berkas video langsung. */
export function urlVideoValid(url) {
  const u = String(url || '').trim()
  if (!u) return false
  if (youtubeId(u)) return true
  return /^https:\/\/\S+\.(mp4|webm|ogg|mov)(\?\S*)?$/i.test(u)
}

export const slideVideo = (s) => s?.jenis === JENIS_SLIDE.video

/** Bentuk SPA untuk slide video outline: layout "media" dengan pemutar sebagai fokus. */
export function spaDariSlideVideo(outlineSlide) {
  const poin = (outlineSlide.content || []).map((c) => String(c).trim()).filter(Boolean)
  const soal = rapikanSoal(outlineSlide.soal_video)
  return {
    slide_no: outlineSlide.slide_no,
    layout: 'media',
    title: outlineSlide.title || 'Video materi',
    image_url: outlineSlide.image_url || '',
    caption: '',
    description: poin.join(' '),
    content: poin,
    ...(soal.length ? { soal_video: soal } : {}),
  }
}

/** Bentuk SPA sederhana untuk slide konten sisipan (bisa dirapikan ulang dengan "Layout SPA"). */
export function spaDariSlideKonten(outlineSlide) {
  const poin = outlineSlide.content || []
  return {
    slide_no: outlineSlide.slide_no,
    layout: 'list',
    title: outlineSlide.title || '',
    content: poin,
    list_items: poin.map((text) => ({ text, color: 'blue' })),
    ...(outlineSlide.image_url ? { image_url: outlineSlide.image_url } : {}),
  }
}

const nomoriUlang = (list) => list.map((s, i) => ({ ...s, slide_no: i + 1 }))

/**
 * Sisipkan slide kosong baru setelah indeks `posisi` (-1 = paling awal).
 * @returns {{ outline: object[], spa: object[]|null, nomorBaru: number }}
 */
export function sisipkanSlide(outlineSlides, spaSlides, posisi, jenis = JENIS_SLIDE.konten) {
  const daftar = outlineSlides || []
  const idx = Math.max(0, Math.min(daftar.length, posisi + 1))
  const baru = jenis === JENIS_SLIDE.video
    ? { slide_no: idx + 1, jenis: JENIS_SLIDE.video, title: '', content: [], image_url: '' }
    : { slide_no: idx + 1, title: '', content: [] }

  const outline = nomoriUlang([...daftar.slice(0, idx), baru, ...daftar.slice(idx)])

  let spa = null
  if (Array.isArray(spaSlides)) {
    const spaBaru = jenis === JENIS_SLIDE.video ? spaDariSlideVideo(baru) : spaDariSlideKonten(baru)
    // SPA bisa saja lebih pendek dari outline (data lama); sisipkan pada posisi yang setara.
    const j = Math.min(spaSlides.length, idx)
    spa = nomoriUlang([...spaSlides.slice(0, j), spaBaru, ...spaSlides.slice(j)])
  }
  return { outline, spa, nomorBaru: idx + 1 }
}

/** Setelah AI membangun SPA, paksa slide video outline tetap menjadi layout media. */
export function terapkanSlideVideo(outlineSlides, spaSlides) {
  if (!Array.isArray(spaSlides)) return spaSlides
  return spaSlides.map((s) => {
    const o = (outlineSlides || []).find((x) => x.slide_no === s.slide_no)
    return o && slideVideo(o) ? spaDariSlideVideo(o) : s
  })
}
