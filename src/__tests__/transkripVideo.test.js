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
  it('format salinan YouTube baru: cap waktu + label pembaca layar menempel ke teks', () => {
    const tempel = [
      '0:000 secondsWhat Is a Broadcast IP Address?',
      '0:1212 secondsA broadcast address is a special IP used to send messages.',
      '1:011 minute, 1 second* Multicasting *Transmitting data to a select group of devices.',
      '1:061 minute, 6 seconds* Unique Identifier',
      '1:431 minute, 43 secondsLearn more at WhatIsMyIP.com.',
      '1:02:051 hour, 2 minutes, 5 secondsBagian jam',
    ].join('\n')
    expect(uraiTranskrip(tempel)).toEqual([
      { detik: 0, teks: 'What Is a Broadcast IP Address?' },
      { detik: 12, teks: 'A broadcast address is a special IP used to send messages.' },
      { detik: 61, teks: '* Multicasting *Transmitting data to a select group of devices.' },
      { detik: 66, teks: '* Unique Identifier' },
      { detik: 103, teks: 'Learn more at WhatIsMyIP.com.' },
      { detik: 3725, teks: 'Bagian jam' },
    ])
  })
  it('label pembaca layar bahasa Indonesia, menempel maupun di baris sendiri', () => {
    expect(uraiTranskrip('0:055 detikHalo\n1:011 menit, 1 detikLanjut')).toEqual([
      { detik: 5, teks: 'Halo' },
      { detik: 61, teks: 'Lanjut' },
    ])
    expect(uraiTranskrip('0:05\n5 detik\nHalo semua')).toEqual([{ detik: 5, teks: 'Halo semua' }])
  })
  it('angka di awal teks materi tidak dianggap label', () => {
    expect(uraiTranskrip('0:05 3 komponen utama')).toEqual([{ detik: 5, teks: '3 komponen utama' }])
    expect(uraiTranskrip('0:05 12 detik pertama')).toEqual([{ detik: 5, teks: '12 detik pertama' }])
  })
  it('teks tanpa cap waktu tidak menghasilkan segmen', () => {
    expect(uraiTranskrip('hanya teks biasa\ntanpa waktu')).toEqual([])
  })
})

describe('transkripUntukAi', () => {
  it('mempertahankan cap waktu tiap segmen bila transkrip muat', () => {
    const t = transkripUntukAi([{ detik: 0, teks: 'a' }, { detik: 5, teks: 'b' }, { detik: 40, teks: 'c' }])
    expect(t).toBe('[0:00] a\n[0:05] b\n[0:40] c\n')
  })
  it('menggabung segmen berdekatan bila transkrip terlalu panjang', () => {
    const t = transkripUntukAi([{ detik: 0, teks: 'a'.repeat(30) }, { detik: 5, teks: 'b'.repeat(30) }, { detik: 40, teks: 'c' }], 90)
    expect(t.split('\n').filter(Boolean)).toHaveLength(2)
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
