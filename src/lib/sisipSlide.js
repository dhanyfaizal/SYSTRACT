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

/* ───────────────────── Studio slide: ubah, hapus, pindah, layout ───────────────────── */

const nomoriUlangDaftar = (list) => list.map((s, i) => ({ ...s, slide_no: i + 1 }))

/** "Judul: isi" → { judul, isi }; tanpa titik dua → { judul: '', isi: baris }. */
export function pecahPoin(baris) {
  const t = String(baris || '').trim()
  const m = t.match(/^([^:]{1,80}):\s+(.+)$/)
  return m ? { judul: m[1].trim(), isi: m[2].trim() } : { judul: '', isi: t }
}

// Layout yang isinya bisa disusun langsung dari poin outline (tanpa AI).
export const LAYOUT_DARI_POIN = ['list', 'grid', 'steps', 'accordion', 'statement']
// Layout yang isinya terstruktur khusus (tabel, angka, diskusi, quiz): poin outline tidak menimpanya.
const LAYOUT_TERSTRUKTUR = new Set(['table', 'stats', 'discussion', 'quiz', 'cover', 'thank_you'])

/** Susun isi SPA untuk `layout` dari poin outline; judul item lama dipertahankan bila poin tak memberi judul. */
export function isiDariPoin(layout, poin, lama = {}) {
  const p = (poin || []).map((x) => String(x).trim()).filter(Boolean)
  switch (layout) {
    case 'list':
      return { list_items: p.map((text, i) => ({ text, color: lama.list_items?.[i]?.color || 'blue' })) }
    case 'grid':
      return { grid_items: p.map((x, i) => { const { judul, isi } = pecahPoin(x); return { title: judul || lama.grid_items?.[i]?.title || `Poin ${i + 1}`, desc: isi, icon: lama.grid_items?.[i]?.icon || 'fa-solid fa-lightbulb' } }) }
    case 'steps':
      return { steps: p.map((x, i) => { const { judul, isi } = pecahPoin(x); return { title: judul || lama.steps?.[i]?.title || `Langkah ${i + 1}`, body: isi } }) }
    case 'accordion':
      return { accordion_items: p.map((x, i) => { const { judul, isi } = pecahPoin(x); return { header: judul || lama.accordion_items?.[i]?.header || `Poin ${i + 1}`, content: isi } }) }
    case 'statement':
      return { body: p.join(' ') }
    case 'split':
      return { split_right: p }
    case 'media':
      return { description: p.join(' ') }
    case 'legacy':
      return {}
    default:
      return {}
  }
}

/** Bagian SPA setelah slide outline diubah (judul, poin, gambar, video & soal). */
export function sinkronSlideSpa(spaSlide, outlineSlide) {
  if (slideVideo(outlineSlide)) return spaDariSlideVideo(outlineSlide)
  const s = spaSlide || spaDariSlideKonten(outlineSlide)
  const poin = outlineSlide.content || []
  const dasar = { ...s, slide_no: outlineSlide.slide_no, title: outlineSlide.title, content: poin }
  if (outlineSlide.image_url !== undefined) dasar.image_url = outlineSlide.image_url || undefined
  if (LAYOUT_TERSTRUKTUR.has(s.layout)) return dasar
  return { ...dasar, ...isiDariPoin(s.layout, poin, s) }
}

/** Ganti layout satu bagian SPA, isinya disusun dari poin outline. */
export function ubahLayoutSpa(spaSlide, outlineSlide, layout) {
  if (!LAYOUT_DARI_POIN.includes(layout)) return spaSlide
  const s = spaSlide || {}
  const bersih = { slide_no: outlineSlide.slide_no, layout, title: outlineSlide.title, content: outlineSlide.content || [] }
  if (s.image_url || outlineSlide.image_url) bersih.image_url = outlineSlide.image_url || s.image_url
  if (s.reference) bersih.reference = s.reference
  return { ...bersih, ...isiDariPoin(layout, outlineSlide.content, s) }
}

/** Hapus slide (outline & SPA), lalu nomori ulang. */
export function hapusSlide(outlineSlides, spaSlides, slideNo) {
  const outline = nomoriUlangDaftar((outlineSlides || []).filter((s) => s.slide_no !== slideNo))
  const spa = Array.isArray(spaSlides) ? nomoriUlangDaftar(spaSlides.filter((s) => s.slide_no !== slideNo)) : spaSlides
  return { outline, spa }
}

/** Pindahkan slide ke atas (-1) atau ke bawah (+1) di outline & SPA. */
export function pindahSlide(outlineSlides, spaSlides, slideNo, arah) {
  const geser = (list) => {
    const a = [...(list || [])]
    const i = a.findIndex((s) => s.slide_no === slideNo)
    const j = i + arah
    if (i < 0 || j < 0 || j >= a.length) return null
    ;[a[i], a[j]] = [a[j], a[i]]
    return nomoriUlangDaftar(a)
  }
  const outline = geser(outlineSlides)
  if (!outline) return null
  const spa = Array.isArray(spaSlides) ? (geser(spaSlides) || spaSlides) : spaSlides
  return { outline, spa, nomorBaru: slideNo + arah }
}
