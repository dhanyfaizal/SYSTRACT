import { describe, it, expect } from 'vitest'
import { findActive, filterNav, firstLeaf } from '@/shell/navUtils'

const NAV = [
  { section: 'Beranda' },
  { id: 'beranda', label: 'Beranda', to: '/dashboard' },
  { id: 'kursus', label: 'Kursus', children: [
    { to: '/mata-kuliah', label: 'Semua' },
    { to: '/mata-kuliah/7', label: 'K7' },
  ] },
  { id: 'k7', label: 'K7', children: [{ to: '/tugas?courseId=7', label: 'Tugas K7' }] },
  { section: 'Admin' },
  { id: 'users', label: 'Pengguna', to: '/admin/users', roles: ['admin'] },
]

describe('findActive', () => {
  it('memilih item paling spesifik', () => {
    const { module, item } = findActive(NAV, '/mata-kuliah/7')
    expect(module.id).toBe('kursus')
    expect(item.label).toBe('K7')
  })
  it('halaman turunan tetap cocok dengan induknya', () => {
    expect(findActive(NAV, '/mata-kuliah/9').item.label).toBe('Semua')
  })
  it('item dengan query hanya cocok bila query sama', () => {
    expect(findActive(NAV, '/tugas', '?courseId=7').item.label).toBe('Tugas K7')
    expect(findActive(NAV, '/tugas', '?courseId=8').item).toBeNull()
  })
})

describe('filterNav', () => {
  it('menyembunyikan item peran lain dan judul bagian yang kosong', () => {
    const hasil = filterNav(NAV, { role: 'mahasiswa' })
    expect(hasil.some((n) => n.id === 'users')).toBe(false)
    expect(hasil.some((n) => n.section === 'Admin')).toBe(false)
    expect(hasil.some((n) => n.section === 'Beranda')).toBe(true)
  })
  it('admin melihat menu admin', () => {
    expect(filterNav(NAV, { role: 'admin' }).some((n) => n.id === 'users')).toBe(true)
  })
})

describe('firstLeaf', () => {
  it('mengembalikan anak pertama yang punya tautan', () => {
    expect(firstLeaf(NAV[2]).to).toBe('/mata-kuliah')
    expect(firstLeaf({ children: [] })).toBeNull()
  })
})
