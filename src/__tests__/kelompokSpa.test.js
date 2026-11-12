import { describe, it, expect } from 'vitest'
import { kelompokkanSlide, gabungSpa } from '@/lib/kelompokSpa'

const outline = (n) => Array.from({ length: n }, (_, i) => ({ slide_no: i + 1, title: `Bagian ${i + 1}`, content: [`poin ${i + 1}`] }))

describe('pemecahan konversi SPA per kelompok', () => {
  it('materi pendek tetap satu kelompok', () => {
    expect(kelompokkanSlide(outline(12)).length).toBe(1)
  })
  it('34 bagian → 3 kelompok berurutan tanpa ada yang hilang', () => {
    const k = kelompokkanSlide(outline(34))
    expect(k.map((x) => x.length)).toEqual([12, 12, 10])
    expect(k.flat().map((s) => s.slide_no)).toEqual(outline(34).map((s) => s.slide_no))
  })
  it('sisa kecil digabung ke kelompok sebelumnya', () => {
    expect(kelompokkanSlide(outline(26)).map((x) => x.length)).toEqual([12, 14])
  })
  it('gabung mengikuti urutan outline; yang hilang diganti daftar, duplikat diabaikan', () => {
    const o = outline(5)
    const { slides, hilang } = gabungSpa(o, [
      { slides: [{ slide_no: 2, layout: 'grid' }, { slide_no: 1, layout: 'cover' }] },
      { slides: [{ slide_no: '4', layout: 'table' }, { slide_no: 5, layout: 'quiz' }, { slide_no: 5, layout: 'list' }] },
    ])
    expect(slides.map((s) => s.layout)).toEqual(['cover', 'grid', 'list', 'table', 'quiz'])
    expect(slides[3].slide_no).toBe(4)
    expect(hilang).toEqual([3])
    expect(slides[2].title).toBe('Bagian 3')
  })
})
