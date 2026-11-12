import { describe, it, expect } from 'vitest'
import { uraiTranskrip, transkripUntukAi, normalkanSoalAi, jumlahSoalAi } from '@/lib/transkripVideo'

describe('uraiTranskrip', () => {
  it('format YouTube: cap waktu di baris sendiri', () => {
    const s = uraiTranskrip('0:00\nSelamat datang\n0:05\nkompresor menaikkan\ntekanan\n1:02:05\npenutup')
    expect(s).toEqual([
      { detik: 0, teks: 'Selamat datang' },
      { detik: 5, teks: 'kompresor menaikkan tekanan' },
      { detik: 3725, teks: 'penutup' },
    ])
  })
  it('format YouTube: cap waktu sebaris', () => {
    expect(uraiTranskrip('0:12 halo semua\n2:30 bagian dua')).toEqual([
      { detik: 12, teks: 'halo semua' },
      { detik: 150, teks: 'bagian dua' },
    ])
  })
  it('format SRT/VTT', () => {
    const srt = '1\n00:00:01,000 --> 00:00:04,000\nPertama\n\n2\n00:01:10,500 --> 00:01:12,000\nKedua'
    expect(uraiTranskrip(srt)).toEqual([{ detik: 1, teks: 'Pertama' }, { detik: 70, teks: 'Kedua' }])
    expect(uraiTranskrip('WEBVTT\n\n00:00:03.000 --> 00:00:05.000\nHalo')).toEqual([{ detik: 3, teks: 'Halo' }])
  })
  it('teks tanpa cap waktu tidak menghasilkan segmen', () => {
    expect(uraiTranskrip('hanya teks biasa\ntanpa waktu')).toEqual([])
  })
})

describe('transkripUntukAi', () => {
  it('menggabung segmen berdekatan dan memberi cap waktu', () => {
    const t = transkripUntukAi([{ detik: 0, teks: 'a' }, { detik: 5, teks: 'b' }, { detik: 40, teks: 'c' }])
    expect(t).toBe('[0:00] a b\n[0:40] c\n')
  })
  it('memotong transkrip yang terlalu panjang', () => {
    const seg = Array.from({ length: 500 }, (_, i) => ({ detik: i * 30, teks: 'x'.repeat(200) }))
    expect(transkripUntukAi(seg, 5000).length).toBeLessThanOrEqual(5000)
  })
})

describe('normalkanSoalAi', () => {
  const soal = (detik, extra = {}) => ({ detik, pertanyaan: `Q${detik}`, opsi: ['A. satu', 'B. dua', 'C. tiga', 'D. empat'], jawaban: 1, penjelasan: 'p', ...extra })
  it('merapikan huruf opsi, jawaban huruf, dan urutan', () => {
    const r = normalkanSoalAi({ soal: [soal(200), soal('1:00', { jawaban: 'C' })] })
    expect(r.map((s) => s.detik)).toEqual([60, 200])
    expect(r[0].jawaban).toBe(2)
    expect(r[0].opsi[0]).toBe('satu')
  })
  it('membuang soal tanpa detik, terlalu rapat, atau tidak lengkap', () => {
    const r = normalkanSoalAi({ soal: [soal(60), soal(70), soal(undefined), soal(300, { pertanyaan: '' }), soal(400)] })
    expect(r.map((s) => s.detik)).toEqual([60, 400])
  })
  it('detik dibatasi ke durasi video', () => {
    expect(normalkanSoalAi({ soal: [soal(999)] }, { durasi: 300 })[0].detik).toBe(299)
  })
  it('jumlah soal mengikuti durasi', () => {
    expect(jumlahSoalAi(0)).toBe(1)
    expect(jumlahSoalAi(16 * 60)).toBe(4)
  })
})
