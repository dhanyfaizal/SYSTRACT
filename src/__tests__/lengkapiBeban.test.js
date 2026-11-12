import { describe, it, expect } from 'vitest'
import {
  estimasiMateri, barisAktivitas, ringkasBaris, dataUntukAi, normalkanSaranAi,
  terapkanSaran, isiMenitOtomatis, daftarPerubahan, bulat5,
} from '@/lib/lengkapiBeban'

const kata = (n) => Array.from({ length: n }, (_, i) => `kata${i}`).join(' ')
const spa = (slides) => ({ slides })

const materi = (over = {}) => ({
  id: 'm1', title: 'Topologi', description: 'Bus, star, ring', week_number: 2,
  estimasi_menit: null, jenis_aktivitas: null, cpmk_kode: [], attachments: [], ...over,
})

describe('estimasi menit materi dari isi SPA', () => {
  it('bukan SPA → null', () => {
    expect(estimasiMateri(materi())).toBeNull()
  })
  it('bacaan: waktu baca × 2, dibulatkan ke 5 menit', () => {
    // 10 bagian × 400 kata = 120 dtk (maks 90) → 900 dtk × 2 = 30 menit
    const slides = Array.from({ length: 10 }, () => ({ layout: 'list', title: kata(400) }))
    const e = estimasiMateri(materi({ webslide_content: spa(slides) }))
    expect(e.menit).toBe(30)
    expect(e.jenis).toBe('bacaan')
  })
  it('video dengan soal: akhir soal + 60 dtk, ×1,2, ditambah waktu soal', () => {
    const slides = [{ layout: 'media', image_url: 'https://youtu.be/dQw4w9WgXcQ', soal_video: [{ detik: 540 }, { detik: 120 }] }]
    const e = estimasiMateri(materi({ webslide_content: spa(slides) }))
    // (600 × 1,2 = 720) + 2 × 30 = 780 dtk = 13 → 15 menit
    expect(e.menit).toBe(15)
    expect(e.jenis).toBe('video')
    expect(e.rincian).toMatch(/1 video/)
  })
  it('latihan dihitung 1 menit per soal', () => {
    const slides = [{ layout: 'quiz', quiz_items: [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}] }]
    expect(estimasiMateri(materi({ webslide_content: spa(slides) })).menit).toBe(10)
  })
  it('bulat5 minimal 5, maksimal 6000', () => {
    expect(bulat5(0)).toBe(5)
    expect(bulat5(11)).toBe(15)
    expect(bulat5(99999)).toBe(6000)
  })
})

describe('baris aktivitas & ringkasan', () => {
  const sumber = {
    materials: [materi({ estimasi_menit: 60, cpmk_kode: ['CPMK-1'] }), materi({ id: 'm2', week_number: 1 })],
    assignments: [{ id: 't1', title: 'Tugas subnetting', estimasi_menit: null, cpmk_kode: [] }],
    exams: [{ id: 'u1', title: 'UTS', exam_mode: 'ujian', duration_minutes: 90, estimasi_menit: null, cpmk_kode: ['CPMK-2'] }],
    forums: [],
  }
  const cpmk = [{ kode: 'CPMK-1', deskripsi: 'a' }, { kode: 'CPMK-2', deskripsi: 'b' }, { kode: 'CPMK-3', deskripsi: 'c' }]

  it('urut kategori lalu pekan', () => {
    const b = barisAktivitas(sumber)
    expect(b.map((x) => x.kunci)).toEqual(['materials:m2', 'materials:m1', 'assignments:t1', 'exams:u1'])
    expect(b[3].kategori).toBe('evaluasi')
  })
  it('ringkasan sama dengan RPC: ujian kosong memakai durasi', () => {
    const r = ringkasBaris(barisAktivitas(sumber), cpmk, 3)
    expect(r.totalMenit).toBe(150)
    expect(r.belumDiisi).toBe(2)
    expect(r.targetMenit).toBe(135 * 60)
    expect(r.cakupan.map((c) => c.jumlah)).toEqual([1, 1, 0])
  })

  it('saran AI: id & kode tak dikenal dibuang, menit dibulatkan, menit dari isi diutamakan', () => {
    const slides = [{ layout: 'quiz', quiz_items: Array(10).fill({}) }]
    const b = barisAktivitas({ ...sumber, materials: [materi({ id: 'm2', week_number: 1, webslide_content: spa(slides) }), materi({ estimasi_menit: 60, cpmk_kode: ['CPMK-1'] })] })
    expect(dataUntukAi(b)[0]).toMatchObject({ id: 'a1', jenis: 'materi', pekan: 1, menit_dari_isi: 10 })

    const saran = normalkanSaranAi({ aktivitas: [
      { id: 'a1', cpmk: ['cpmk-3', 'CPMK-9'], menit: 999, alasan: 'x' },
      { id: 'a2', cpmk: ['CPMK-2'], menit: 30 },
      { id: 'a3', cpmk: ['CPMK-3'], menit: 241 },
      { id: 'a99', cpmk: ['CPMK-1'], menit: 10 },
    ] }, b, cpmk.map((c) => c.kode))
    expect(saran.size).toBe(3)
    expect(saran.get('materials:m2').cpmk).toEqual(['CPMK-3'])

    const hasil = terapkanSaran(b, saran)
    expect(hasil[0]).toMatchObject({ menit: 10, sumberMenit: 'isi', cpmk: ['CPMK-3'] })
    expect(hasil[1]).toMatchObject({ menit: 60, cpmk: ['CPMK-1'] })          // sudah terisi, tidak ditimpa
    expect(hasil[2]).toMatchObject({ menit: 245, sumberMenit: 'ai' })
    expect(terapkanSaran(b, saran, { timpa: true })[1].cpmk).toEqual(['CPMK-2'])
  })

  it('isi otomatis & daftar perubahan', () => {
    const slides = [{ layout: 'quiz', quiz_items: Array(10).fill({}) }]
    const awal = barisAktivitas({ materials: [materi({ webslide_content: spa(slides) })] })
    const baru = isiMenitOtomatis(awal).map((x) => ({ ...x, cpmk: ['CPMK-1'], jenisMateri: 'praktik' }))
    expect(daftarPerubahan(baru, awal)).toEqual([
      { tabel: 'materials', id: 'm1', patch: { estimasi_menit: 10, cpmk_kode: ['CPMK-1'], jenis_aktivitas: 'praktik' } },
    ])
    expect(daftarPerubahan(awal, awal)).toEqual([])
  })
})
