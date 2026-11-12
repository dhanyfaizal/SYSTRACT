import { describe, it, expect, beforeEach } from 'vitest'
import { teksSlide, hitungKata, targetBacaBagian, totalBaca, bagianTerlihat } from '@/lib/bacaBagian'
import { renderSection, prepareDeck } from '@/lib/spaBlocks'
import { pasangLatihan } from '@/lib/latihanInteraktif'

const kata = (n) => Array.from({ length: n }, (_, i) => `kata${i}`).join(' ')

describe('waktu baca per bagian', () => {
  it('mengambil teks isi saja (tanpa URL, ikon, metadata, tag)', () => {
    const t = teksSlide({ slide_no: 3, layout: 'grid', title: 'Judul <strong>tebal</strong>', image_url: 'https://x.id/a.png', grid_items: [{ title: 'A', desc: 'satu dua', icon: 'fa-solid fa-x' }] })
    expect(t).toBe('Judul tebal A satu dua')
    expect(hitungKata(t)).toBe(5)
  })
  it('±200 kata/menit, minimal 8 dan maksimal 90 detik', () => {
    expect(targetBacaBagian({ layout: 'list', title: 'x' })).toBe(8)
    expect(targetBacaBagian({ layout: 'list', title: kata(100) })).toBe(30)
    expect(targetBacaBagian({ layout: 'list', title: kata(1000) })).toBe(90)
  })
  it('tabel/langkah/angka +10 detik; video & latihan tanpa waktu baca; sampul singkat', () => {
    expect(targetBacaBagian({ layout: 'table', title: kata(100) })).toBe(40)
    expect(targetBacaBagian({ layout: 'media', title: kata(100) })).toBe(0)
    expect(targetBacaBagian({ layout: 'quiz', title: kata(100) })).toBe(0)
    expect(targetBacaBagian({ layout: 'cover', title: kata(100) })).toBe(4)
  })
  it('contoh 20 bagian ±70 kata ≈ 7 menit', () => {
    const slides = Array.from({ length: 20 }, () => ({ layout: 'list', title: kata(70) }))
    expect(Math.round(totalBaca(slides) / 60)).toBe(7)
  })
  it('bagian dianggap terlihat bila cukup besar di panel', () => {
    const panel = { top: 0, bottom: 600, height: 600 }
    expect(bagianTerlihat({ top: 100, bottom: 300, height: 200 }, panel)).toBe(true)
    expect(bagianTerlihat({ top: 550, bottom: 750, height: 200 }, panel)).toBe(false)
    expect(bagianTerlihat({ top: -2000, bottom: 400, height: 2400 }, panel)).toBe(true)
    expect(bagianTerlihat({ top: 700, bottom: 900, height: 200 }, panel)).toBe(false)
  })
})

describe('mini quiz interaktif', () => {
  const slide = { slide_no: 5, layout: 'quiz', title: 'Latihan', quiz_items: [
    { question: 'Q1', options: ['a', 'b', 'c', 'd', 'e'], answer: 2, explanation: 'karena c' },
    { question: 'Q2', options: ['a', 'b', 'c', 'd', 'e'], answer: 0, explanation: '' },
  ] }
  let sec
  let progres
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = renderSection(prepareDeck({ slides: [slide] }).slides[0], 4)
    sec = document.querySelector('section')
    progres = null
  })
  const pilih = (qi, oi) => {
    const inp = sec.querySelectorAll('.sx-q')[qi].querySelectorAll('.sx-opt input')[oi]
    inp.checked = true
    inp.dispatchEvent(new Event('change'))
  }

  it('jawaban benar tidak ditandai sebelum dijawab', () => {
    pasangLatihan(sec, slide.quiz_items, { onProgres: (p) => { progres = p } })
    expect(sec.querySelectorAll('.is-correct')).toHaveLength(0)
    expect(progres).toEqual({ terjawab: 0, total: 2 })
  })
  it('salah: tidak membuka kunci, pilihan dikunci, bisa coba lagi', () => {
    pasangLatihan(sec, slide.quiz_items, { onProgres: (p) => { progres = p } })
    pilih(0, 0)
    const q = sec.querySelectorAll('.sx-q')[0]
    expect(q.querySelector('.is-salah')).not.toBeNull()
    expect(q.querySelector('.is-benar')).toBeNull()
    expect(q.querySelector('.sx-lat-msg').textContent).toMatch(/Belum tepat/)
    expect(progres.terjawab).toBe(0)
    pilih(0, 2)
    expect(q.querySelector('.is-benar')).not.toBeNull()
    expect(q.classList.contains('is-selesai')).toBe(true)
    expect(progres.terjawab).toBe(1)
  })
  it('progres tersimpan dan dipulihkan', () => {
    pasangLatihan(sec, slide.quiz_items, { kunci: 'lat', onProgres: (p) => { progres = p } })
    pilih(0, 2)
    pilih(1, 0)
    expect(progres).toEqual({ terjawab: 2, total: 2 })
    document.body.innerHTML = renderSection(prepareDeck({ slides: [slide] }).slides[0], 4)
    sec = document.querySelector('section')
    pasangLatihan(sec, slide.quiz_items, { kunci: 'lat', onProgres: (p) => { progres = p } })
    expect(progres).toEqual({ terjawab: 2, total: 2 })
    expect(sec.querySelectorAll('.sx-q.is-selesai')).toHaveLength(2)
  })
})
