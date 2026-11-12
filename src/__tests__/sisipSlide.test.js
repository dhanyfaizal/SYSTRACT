import { describe, it, expect } from 'vitest'
import { sisipkanSlide, terapkanSlideVideo, spaDariSlideVideo, urlVideoValid, JENIS_SLIDE } from '@/lib/sisipSlide'

const outline = [
  { slide_no: 1, title: 'Pembuka', content: ['a'] },
  { slide_no: 2, title: 'Konsep', content: ['b'] },
  { slide_no: 3, title: 'Latihan', content: ['c'] },
]
const spa = [
  { slide_no: 1, layout: 'cover', title: 'Pembuka' },
  { slide_no: 2, layout: 'grid', title: 'Konsep' },
  { slide_no: 3, layout: 'quiz', title: 'Latihan' },
]

describe('urlVideoValid', () => {
  it('menerima YouTube dan berkas video https', () => {
    expect(urlVideoValid('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
    expect(urlVideoValid('https://youtu.be/dQw4w9WgXcQ?t=30')).toBe(true)
    expect(urlVideoValid('https://cdn.contoh.id/materi.mp4')).toBe(true)
  })
  it('menolak tautan lain', () => {
    expect(urlVideoValid('')).toBe(false)
    expect(urlVideoValid('https://contoh.id/gambar.png')).toBe(false)
    expect(urlVideoValid('javascript:alert(1)')).toBe(false)
    expect(urlVideoValid('http://cdn.contoh.id/materi.mp4')).toBe(false)
  })
})

describe('sisipkanSlide', () => {
  it('menyisipkan slide video di tengah outline dan SPA, lalu menomori ulang', () => {
    const r = sisipkanSlide(outline, spa, 0, JENIS_SLIDE.video)
    expect(r.nomorBaru).toBe(2)
    expect(r.outline.map((s) => s.title)).toEqual(['Pembuka', '', 'Konsep', 'Latihan'])
    expect(r.outline.map((s) => s.slide_no)).toEqual([1, 2, 3, 4])
    expect(r.outline[1].jenis).toBe('video')
    expect(r.spa.map((s) => s.layout)).toEqual(['cover', 'media', 'grid', 'quiz'])
    expect(r.spa.map((s) => s.slide_no)).toEqual([1, 2, 3, 4])
  })
  it('bisa menyisipkan di awal dan di akhir', () => {
    expect(sisipkanSlide(outline, spa, -1).outline[0].slide_no).toBe(1)
    expect(sisipkanSlide(outline, spa, -1).spa[1].title).toBe('Pembuka')
    const akhir = sisipkanSlide(outline, spa, 2)
    expect(akhir.nomorBaru).toBe(4)
    expect(akhir.spa[3].layout).toBe('list')
  })
  it('tanpa SPA, hanya outline yang berubah', () => {
    const r = sisipkanSlide(outline, null, 1)
    expect(r.spa).toBeNull()
    expect(r.outline).toHaveLength(4)
  })
  it('tidak mengubah larik asal', () => {
    sisipkanSlide(outline, spa, 0, JENIS_SLIDE.video)
    expect(outline).toHaveLength(3)
    expect(spa).toHaveLength(3)
  })
})

describe('slide video di SPA', () => {
  const video = { slide_no: 2, jenis: 'video', title: 'Video: Siklus Refrigerasi', image_url: 'https://youtu.be/dQw4w9WgXcQ', content: ['Perhatikan', 'tahap kompresi.'] }
  it('selalu menjadi layout media dengan pemutar', () => {
    const s = spaDariSlideVideo(video)
    expect(s.layout).toBe('media')
    expect(s.image_url).toBe(video.image_url)
    expect(s.description).toBe('Perhatikan tahap kompresi.')
  })
  it('hasil AI untuk slide video ditimpa menjadi layout media', () => {
    const hasilAi = [{ slide_no: 1, layout: 'cover' }, { slide_no: 2, layout: 'statement', title: 'x' }]
    const r = terapkanSlideVideo([{ slide_no: 1, title: 'a' }, video], hasilAi)
    expect(r[0].layout).toBe('cover')
    expect(r[1].layout).toBe('media')
  })
})
