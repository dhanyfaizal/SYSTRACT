// Memuat data async berdasarkan sebuah kunci (mis. id pengguna, id kursus) tanpa setState di dalam efek.
//
// - `muat(kunci)` mengembalikan Promise berisi data; dipanggil ulang saat kunci berubah atau
//   saat `muatUlang()` dipanggil.
// - `loading` diturunkan dari data: benar sampai hasil untuk kunci & versi saat ini tiba.
// - Respons yang tiba setelah kunci berganti diabaikan.
// - Selama memuat ulang dengan kunci yang sama, data lama tetap tersedia.
// - Kunci kosong (null/undefined/'') berarti tidak ada yang dimuat: data null, loading false.
import { useEffect, useRef, useState } from 'react'

/** @returns {{ data: any, loading: boolean, galat: unknown, muatUlang: () => void }} */
export function useMuatData(kunci, muat) {
  const [versi, setVersi] = useState(0)
  const [hasil, setHasil] = useState({ id: null, kunci: null, data: null, galat: null })
  const muatRef = useRef(muat)
  useEffect(() => { muatRef.current = muat })

  const aktif = kunci !== null && kunci !== undefined && kunci !== ''
  const id = aktif ? `${String(kunci)}:${versi}` : null

  useEffect(() => {
    if (!aktif) return undefined
    let batal = false
    const idIni = `${String(kunci)}:${versi}`
    Promise.resolve()
      .then(() => muatRef.current(kunci))
      .then(
        (data) => { if (!batal) setHasil({ id: idIni, kunci, data, galat: null }) },
        (galat) => {
          console.error('[SYSTRACT] gagal memuat data:', galat)
          if (!batal) setHasil((h) => ({ id: idIni, kunci, data: h.kunci === kunci ? h.data : null, galat }))
        },
      )
    return () => { batal = true }
  }, [aktif, kunci, versi])

  const kunciSama = aktif && hasil.kunci === kunci
  return {
    data: kunciSama ? hasil.data : null,
    galat: kunciSama ? hasil.galat : null,
    loading: aktif && hasil.id !== id,
    muatUlang: () => setVersi((v) => v + 1),
  }
}
