import { describe, it, expect } from 'vitest'
import { MODULES, groupMaterialsIntoModules } from '@/lib/modules'
import { youtubeId } from '@/lib/spaBlocks'

describe('groupMaterialsIntoModules', () => {
  it('mengelompokkan pertemuan ke modul yang benar', () => {
    const items = [{ week_number: 0 }, { week_number: 2 }, { week_number: 8 }, { week_number: 16 }, { week_number: 20 }]
    expect(groupMaterialsIntoModules(items).map((m) => m.name)).toEqual([
      'Pengantar', 'Modul 1 · Fondasi & Konsep Dasar', 'Evaluasi Tengah', 'Evaluasi Akhir', 'Materi Tambahan',
    ])
  })
  it('modul kosong tidak ditampilkan', () => {
    expect(groupMaterialsIntoModules([])).toEqual([])
  })
  it('keterangan rentang pertemuan', () => {
    expect(MODULES[0].range).toBe('Pertemuan 1–4')
    expect(MODULES[2].range).toBe('Pertemuan 8')
  })
})

describe('youtubeId', () => {
  it('mengenali berbagai bentuk URL YouTube', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=3')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/watch?list=x&v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it('URL lain menghasilkan null', () => {
    expect(youtubeId('https://vimeo.com/123')).toBeNull()
    expect(youtubeId()).toBeNull()
  })
})
