// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { useMuatData } from '@/hooks/useMuatData'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Pemuat yang bisa diselesaikan manual per kunci, untuk mengatur urutan respons.
function pemuatTertunda() {
  const antre = []
  const muat = (kunci) => new Promise((resolve) => antre.push({ kunci, resolve }))
  const selesaikan = async (kunci, data) => {
    const i = antre.findIndex((x) => x.kunci === kunci)
    const [x] = antre.splice(i, 1)
    await act(async () => { x.resolve(data) })
  }
  return { muat, selesaikan, antre }
}

let root, wadah, hasil
function Uji({ kunci, muat, tangkap }) {
  tangkap(useMuatData(kunci, muat))
  return null
}
const render = async (props) => { await act(async () => { root.render(createElement(Uji, { ...props, tangkap: (h) => { hasil = h } })) }) }

beforeEach(() => { wadah = document.createElement('div'); root = createRoot(wadah) })
afterEach(() => { act(() => root.unmount()) })

describe('useMuatData', () => {
  it('kunci kosong: tidak memuat', async () => {
    const p = pemuatTertunda()
    await render({ kunci: null, muat: p.muat })
    expect(hasil).toMatchObject({ data: null, loading: false })
    expect(p.antre.length).toBe(0)
  })

  it('memuat lalu menampilkan data', async () => {
    const p = pemuatTertunda()
    await render({ kunci: 'a', muat: p.muat })
    expect(hasil.loading).toBe(true)
    await p.selesaikan('a', [1, 2])
    expect(hasil).toMatchObject({ data: [1, 2], loading: false })
  })

  it('respons kunci lama yang terlambat diabaikan', async () => {
    const p = pemuatTertunda()
    await render({ kunci: 'a', muat: p.muat })
    await render({ kunci: 'b', muat: p.muat })
    await p.selesaikan('b', 'data b')
    await p.selesaikan('a', 'data a') // tiba belakangan
    expect(hasil).toMatchObject({ data: 'data b', loading: false })
  })

  it('muat ulang: data lama tetap tampil sampai data baru tiba', async () => {
    const p = pemuatTertunda()
    await render({ kunci: 'a', muat: p.muat })
    await p.selesaikan('a', 'v1')
    await act(async () => { hasil.muatUlang() })
    expect(hasil).toMatchObject({ data: 'v1', loading: true })
    await p.selesaikan('a', 'v2')
    expect(hasil).toMatchObject({ data: 'v2', loading: false })
  })

  it('ganti kunci: data kunci lama tidak ikut tampil', async () => {
    const p = pemuatTertunda()
    await render({ kunci: 'a', muat: p.muat })
    await p.selesaikan('a', 'data a')
    await render({ kunci: 'b', muat: p.muat })
    expect(hasil).toMatchObject({ data: null, loading: true })
  })
})
