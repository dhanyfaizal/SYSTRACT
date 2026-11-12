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

import { pecahPoin, isiDariPoin, sinkronSlideSpa, ubahLayoutSpa, hapusSlide, pindahSlide } from '@/lib/sisipSlide'

describe('studio slide', () => {
  it('pecahPoin mengenali "Judul: isi"', () => {
    expect(pecahPoin('Network Address: alamat pertama')).toEqual({ judul: 'Network Address', isi: 'alamat pertama' })
    expect(pecahPoin('tanpa judul')).toEqual({ judul: '', isi: 'tanpa judul' })
    expect(pecahPoin('Waktu 10:30 pagi')).toEqual({ judul: '', isi: 'Waktu 10:30 pagi' })
  })
  it('kartu: judul lama dipertahankan bila poin tidak memberi judul', () => {
    const lama = { grid_items: [{ title: 'Network', desc: 'x', icon: 'fa-solid fa-network-wired' }] }
    const r = isiDariPoin('grid', ['isi baru', 'Broadcast: alamat terakhir'], lama)
    expect(r.grid_items[0]).toEqual({ title: 'Network', desc: 'isi baru', icon: 'fa-solid fa-network-wired' })
    expect(r.grid_items[1].title).toBe('Broadcast')
  })
  it('sinkron tidak menimpa tabel/quiz, hanya judul', () => {
    const spa = { slide_no: 3, layout: 'table', title: 'lama', table_data: { headers: ['a'], rows: [['1']] } }
    const r = sinkronSlideSpa(spa, { slide_no: 3, title: 'Baru', content: ['x'] })
    expect(r.title).toBe('Baru')
    expect(r.table_data).toEqual(spa.table_data)
  })
  it('ganti layout menyusun isi dari poin', () => {
    const r = ubahLayoutSpa({ layout: 'list', list_items: [] }, { slide_no: 2, title: 'T', content: ['Langkah A: lakukan a', 'lakukan b'] }, 'steps')
    expect(r.layout).toBe('steps')
    expect(r.steps.map((s) => s.title)).toEqual(['Langkah A', 'Langkah 2'])
    expect(ubahLayoutSpa({ layout: 'list' }, { slide_no: 2 }, 'table')).toEqual({ layout: 'list' })
  })
  it('hapus dan pindah menomori ulang kedua daftar', () => {
    const o = [{ slide_no: 1, title: 'a' }, { slide_no: 2, title: 'b' }, { slide_no: 3, title: 'c' }]
    const s = o.map((x) => ({ ...x, layout: 'list' }))
    const h = hapusSlide(o, s, 2)
    expect(h.outline.map((x) => `${x.slide_no}${x.title}`)).toEqual(['1a', '2c'])
    expect(h.spa.map((x) => `${x.slide_no}${x.title}`)).toEqual(['1a', '2c'])
    const p = pindahSlide(o, s, 3, -1)
    expect(p.outline.map((x) => x.title)).toEqual(['a', 'c', 'b'])
    expect(p.spa.map((x) => x.slide_no)).toEqual([1, 2, 3])
    expect(p.nomorBaru).toBe(2)
    expect(pindahSlide(o, s, 1, -1)).toBeNull()
  })
})
