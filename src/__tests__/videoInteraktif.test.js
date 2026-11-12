import { describe, it, expect } from 'vitest'
import { rapikanSoal, periksaSoal, langkahPemutar, awalSegmen, formatDetik, bacaDetik, saranJumlahSoal } from '@/lib/videoInteraktif'
import { renderSection } from '@/lib/spaBlocks'
import { spaDariSlideVideo } from '@/lib/sisipSlide'

const q = (detik, extra = {}) => ({ detik, pertanyaan: `Soal ${detik}`, opsi: ['a', 'b', '', ''], jawaban: 1, penjelasan: '', ...extra })

describe('rapikanSoal & periksaSoal', () => {
  it('mengurutkan menurut detik dan membuang soal yang tidak lengkap', () => {
    const r = rapikanSoal([q(120), q(30), { detik: 50, pertanyaan: '', opsi: ['a', 'b'] }, q(60, { jawaban: 3 })])
    expect(r.map((s) => s.detik)).toEqual([30, 120])
  })
  it('memberi pesan kesalahan yang jelas (5 pilihan wajib)', () => {
    const lima = { opsi: ['a', 'b', 'c', 'd', 'e'] }
    expect(periksaSoal(q(10, lima))).toBe('')
    expect(periksaSoal(q(10, { ...lima, pertanyaan: ' ' }))).toMatch(/Pertanyaan/)
    expect(periksaSoal(q(10))).toMatch(/kelima pilihan/)
    expect(periksaSoal(q(10, { opsi: ['a', 'b', 'c', 'd', ' '] }))).toMatch(/kelima pilihan/)
    expect(periksaSoal(q(10, { ...lima, jawaban: 7 }))).toMatch(/ditandai benar/)
    expect(periksaSoal(q(400, lima), 300)).toMatch(/durasi/)
  })
  it('soal lama berpilihan kurang dari 5 tetap bisa diputar peserta', () => {
    expect(rapikanSoal([q(30)])).toHaveLength(1)
  })
})

describe('format waktu', () => {
  it('format dan baca m:ss', () => {
    expect(formatDetik(125)).toBe('2:05')
    expect(formatDetik(3725)).toBe('1:02:05')
    expect(bacaDetik('2:05')).toBe(125)
    expect(bacaDetik('1:02:05')).toBe(3725)
    expect(bacaDetik('90')).toBe(90)
    expect(bacaDetik('2:5')).toBeNaN()
  })
  it('saran jumlah soal mengikuti durasi', () => {
    expect(saranJumlahSoal(120)).toBe(1)
    expect(saranJumlahSoal(20 * 60)).toBe(5)
    expect(saranJumlahSoal(3 * 3600)).toBe(8)
  })
})

describe('langkahPemutar', () => {
  const soal = rapikanSoal([q(60), q(180)])
  it('memutar biasa dan mencatat titik terjauh', () => {
    const r = langkahPemutar({ soal, terjawab: new Set(), waktu: 10.5, maks: 10.25 })
    expect(r.aksi).toBe('lanjut')
    expect(r.maks).toBe(10.5)
  })
  it('berhenti dan menampilkan soal saat mencapai detiknya', () => {
    expect(langkahPemutar({ soal, terjawab: new Set(), waktu: 60, maks: 59.8 })).toMatchObject({ aksi: 'soal', indeks: 0 })
  })
  it('mengembalikan peserta yang melompat ke bagian belum ditonton', () => {
    expect(langkahPemutar({ soal, terjawab: new Set(), waktu: 40, maks: 12 })).toMatchObject({ aksi: 'kembali', ke: 12 })
  })
  it('tidak bisa melompati soal yang belum dijawab', () => {
    expect(langkahPemutar({ soal, terjawab: new Set(), waktu: 150, maks: 60 })).toMatchObject({ aksi: 'kembali', ke: 60 })
  })
  it('setelah soal 1 dijawab, berlanjut ke soal 2', () => {
    expect(langkahPemutar({ soal, terjawab: new Set([0]), waktu: 180.1, maks: 180 })).toMatchObject({ aksi: 'soal', indeks: 1 })
  })
  it('jawaban salah memutar ulang dari soal sebelumnya', () => {
    expect(awalSegmen(soal, 0)).toBe(0)
    expect(awalSegmen(soal, 1)).toBe(60)
  })
})

describe('render SPA video interaktif', () => {
  const slide = spaDariSlideVideo({ slide_no: 2, jenis: 'video', title: 'Video', image_url: 'https://youtu.be/dQw4w9WgXcQ', content: [], soal_video: [q(30)] })
  it('menandai iframe dan mengaktifkan API YouTube', () => {
    const html = renderSection(slide, 1)
    expect(html).toContain('data-vi="1"')
    expect(html).toContain('enablejsapi=1')
    expect(html).toContain('data-k="soal_video"')
    expect(html).not.toContain('allowfullscreen')
  })
  it('video tanpa soal tetap pemutar biasa', () => {
    const html = renderSection({ ...slide, soal_video: undefined }, 1)
    expect(html).not.toContain('data-vi')
    expect(html).not.toContain('enablejsapi')
  })
})
