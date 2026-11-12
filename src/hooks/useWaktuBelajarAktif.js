import { useEffect, useRef, useState } from 'react'

export const DETIK_DIAM_MAKS = 120     // tanpa interaksi selama ini → dianggap tidak membaca
const DETIK_BAWAAN = 180               // bila dosen belum mengisi estimasi
const DETIK_MIN = 60
const DETIK_MAKS = 30 * 60
const PORSI_ESTIMASI = 0.5             // minimal separuh estimasi dosen (estimasi = rata-rata peserta)

/** Waktu belajar aktif minimal (detik) untuk satu lampiran materi. */
export function targetDetikMateri(estimasiMenit, jumlahLampiran = 1) {
  const m = Number(estimasiMenit)
  if (!m || m <= 0) return DETIK_BAWAAN
  const per = (m * 60 * PORSI_ESTIMASI) / Math.max(1, Number(jumlahLampiran) || 1)
  return Math.round(Math.min(DETIK_MAKS, Math.max(DETIK_MIN, per)))
}

/** Lampiran video (YouTube/Vimeo/berkas video): tidak memakai deteksi diam, karena menonton tidak butuh gerakan. */
export function lampiranVideo(lampiran) {
  if (!lampiran) return false
  return /^video/i.test(lampiran.mime || '') || /(youtube\.com|youtu\.be|vimeo\.com)/i.test(lampiran.url || '')
}

const baca = (k) => { try { return Math.max(0, parseInt(localStorage.getItem(k) || '0', 10) || 0) } catch { return 0 } }
const tulis = (k, v) => { try { localStorage.setItem(k, String(v)) } catch { /* penyimpanan diblokir: tetap jalan di memori */ } }

/**
 * Menghitung waktu belajar AKTIF (bukan waktu sejak dibuka): berhenti saat tab tidak terlihat
 * atau tidak ada interaksi selama DETIK_DIAM_MAKS (kecuali video).
 * Akumulasi disimpan per lampiran di perangkat, jadi bisa dilanjutkan nanti.
 *
 * @returns {{ sisa: number, total: number, dijeda: null|'tab'|'diam' }}
 */
export function useWaktuBelajarAktif({ aktif, kunci, targetDetik, pantauDiam = true }) {
  const [terpakai, setTerpakai] = useState(() => (kunci ? baca(kunci) : 0))
  const [dijeda, setDijeda] = useState(null)
  const interaksiTerakhir = useRef(0) // diisi saat efek berjalan (Date.now tidak boleh dipanggil saat render)

  // Ganti lampiran → muat akumulasi milik lampiran itu.
  useEffect(() => {
    setTerpakai(kunci ? baca(kunci) : 0)
    interaksiTerakhir.current = Date.now()
  }, [kunci])

  useEffect(() => {
    if (!aktif || !kunci) return undefined
    const tandai = () => { interaksiTerakhir.current = Date.now() }
    tandai()
    const kejadian = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel']
    kejadian.forEach((k) => window.addEventListener(k, tandai, { passive: true, capture: true }))
    document.addEventListener('visibilitychange', tandai)

    const id = setInterval(() => {
      // Tab tersembunyi (pindah tab / jendela diperkecil) → jeda. Fokus jendela sengaja tidak disyaratkan:
      // peserta bisa membaca di monitor lain; ketidakaktifan ditangkap oleh deteksi diam di bawah.
      if (document.visibilityState !== 'visible') { setDijeda('tab'); return }
      if (pantauDiam && (Date.now() - interaksiTerakhir.current) / 1000 > DETIK_DIAM_MAKS) { setDijeda('diam'); return }
      setDijeda(null)
      setTerpakai((t) => {
        const baru = Math.min(t + 1, targetDetik)
        tulis(kunci, baru)
        return baru
      })
    }, 1000)

    return () => {
      clearInterval(id)
      kejadian.forEach((k) => window.removeEventListener(k, tandai, { capture: true }))
      document.removeEventListener('visibilitychange', tandai)
    }
  }, [aktif, kunci, targetDetik, pantauDiam])

  return { sisa: Math.max(0, targetDetik - terpakai), total: targetDetik, dijeda: aktif ? dijeda : null }
}
