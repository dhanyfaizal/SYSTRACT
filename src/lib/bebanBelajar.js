// Beban belajar (student learning time) dan kesetaraan SKS.
// Dasar: Permendikbudristek No. 53 Tahun 2023 — 1 SKS = 45 jam belajar per semester.

export const JAM_PER_SKS = 45
export const MENIT_PER_SKS = JAM_PER_SKS * 60

export const JENIS_AKTIVITAS = [
  { key: 'video',    label: 'Video' },
  { key: 'bacaan',   label: 'Bacaan / modul' },
  { key: 'praktik',  label: 'Praktik' },
  { key: 'forum',    label: 'Forum diskusi' },
  { key: 'tugas',    label: 'Tugas / proyek' },
  { key: 'kuis',     label: 'Kuis & latihan' },
  { key: 'evaluasi', label: 'Evaluasi akhir' },
]

/** Jenis aktivitas materi yang bisa dipilih dosen (sisanya ditentukan dari jenis kegiatan). */
export const JENIS_MATERI = JENIS_AKTIVITAS.filter((j) => ['video', 'bacaan', 'praktik'].includes(j.key))

/** Tebakan awal jenis materi dari lampiran pertamanya. */
export function tebakJenisMateri(attachments = []) {
  const a = attachments.find((x) => x?.url) || attachments[0]
  if (!a) return 'bacaan'
  if (/^video/i.test(a.mime || '') || /(youtube\.com|youtu\.be|vimeo\.com)/i.test(a.url || '')) return 'video'
  return 'bacaan'
}

export const targetMenit = (sks) => Math.max(0, Number(sks) || 0) * MENIT_PER_SKS
export const sksSetara = (menit) => Math.floor((Number(menit) || 0) / MENIT_PER_SKS)

/** "2 jam 30 menit", "45 menit", "0 menit". */
export function formatDurasi(menit) {
  const m = Math.max(0, Math.round(Number(menit) || 0))
  const j = Math.floor(m / 60), s = m % 60
  if (!j) return `${s} menit`
  return s ? `${j} jam ${s} menit` : `${j} jam`
}

/** Jam dengan satu desimal bila perlu: 135, 97,5 */
export function formatJam(menit) {
  const j = (Number(menit) || 0) / 60
  return j.toLocaleString('id-ID', { maximumFractionDigits: 1 })
}

/**
 * Status kelayakan dari hasil RPC ringkasan_beban_belajar.
 * @returns {{ status: 'belum_sks'|'kurang'|'memenuhi', persen: number, kurangMenit: number, pesan: string }}
 */
export function statusKelayakan(r) {
  const target = Number(r?.target_menit) || 0
  const total = Number(r?.total_menit) || 0
  if (!target) return { status: 'belum_sks', persen: 0, kurangMenit: 0, pesan: 'Jumlah SKS kursus belum diisi.' }
  const persen = Math.min(100, Math.round((total / target) * 100))
  const kurangMenit = Math.max(0, target - total)
  if (kurangMenit === 0) return { status: 'memenuhi', persen, kurangMenit, pesan: `Memenuhi beban ${r.sks} SKS (≥ ${formatJam(target)} jam).` }
  return { status: 'kurang', persen, kurangMenit, pesan: `Kurang ${formatDurasi(kurangMenit)} untuk memenuhi ${r.sks} SKS.` }
}
