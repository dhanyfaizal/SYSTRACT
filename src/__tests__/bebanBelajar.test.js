import { describe, it, expect } from 'vitest'
import { targetMenit, sksSetara, formatDurasi, formatJam, statusKelayakan, tebakJenisMateri, MENIT_PER_SKS } from '@/lib/bebanBelajar'

describe('beban belajar (1 SKS = 45 jam)', () => {
  it('target menit per SKS', () => {
    expect(MENIT_PER_SKS).toBe(2700)
    expect(targetMenit(2)).toBe(90 * 60)
    expect(targetMenit(3)).toBe(135 * 60)
    expect(targetMenit(4)).toBe(180 * 60)
    expect(targetMenit(null)).toBe(0)
  })
  it('setara SKS dibulatkan ke bawah', () => {
    expect(sksSetara(32 * 60)).toBe(0)       // kursus pendek 32 jam: belum setara 1 SKS
    expect(sksSetara(90 * 60)).toBe(2)
    expect(sksSetara(134 * 60)).toBe(2)
    expect(sksSetara(135 * 60)).toBe(3)
  })
  it('format durasi dan jam', () => {
    expect(formatDurasi(0)).toBe('0 menit')
    expect(formatDurasi(45)).toBe('45 menit')
    expect(formatDurasi(120)).toBe('2 jam')
    expect(formatDurasi(150)).toBe('2 jam 30 menit')
    expect(formatJam(5850)).toBe('97,5')
    expect(formatJam(8100)).toBe('135')
  })
  it('status kelayakan', () => {
    expect(statusKelayakan({ sks: 3, target_menit: 8100, total_menit: 8100 }).status).toBe('memenuhi')
    const kurang = statusKelayakan({ sks: 3, target_menit: 8100, total_menit: 7080 })
    expect(kurang.status).toBe('kurang')
    expect(kurang.kurangMenit).toBe(1020)
    expect(kurang.persen).toBe(87)
    expect(kurang.pesan).toBe('Kurang 17 jam untuk memenuhi 3 SKS.')
    expect(statusKelayakan({ sks: null, target_menit: 0, total_menit: 600 }).status).toBe('belum_sks')
  })
  it('tebak jenis materi dari lampiran', () => {
    expect(tebakJenisMateri([{ url: 'https://youtu.be/abc', mime: 'link' }])).toBe('video')
    expect(tebakJenisMateri([{ url: 'https://drive.google.com/x', mime: 'application/pdf' }])).toBe('bacaan')
    expect(tebakJenisMateri([])).toBe('bacaan')
  })
})
