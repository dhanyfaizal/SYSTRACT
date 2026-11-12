// Video interaktif: video berhenti di detik tertentu dan menampilkan soal pilihan ganda.
//
// - Peserta tidak bisa melompat ke bagian yang belum ditonton, dan tidak bisa melewati soal
//   yang belum dijawab benar.
// - Jawaban salah → penjelasan singkat, lalu segmen sebelum soal diputar ulang.
// - Progres (soal terjawab + titik terjauh yang ditonton) disimpan per peserta di perangkat.
//
// Kunci jawaban ada di browser (soal ini latihan formatif agar peserta menyimak, bukan ujian).

export const SOAL_MAKS_PER_VIDEO = 12
export const JUMLAH_PILIHAN = 5 // semua soal pilihan ganda SYSTRACT memakai 5 pilihan (A–E)
const TOLERANSI_LOMPAT = 2 // detik: selisih yang masih dianggap pemutaran normal, bukan lompatan

/* ------------------------------- Logika murni ------------------------------- */

/** Rapikan & urutkan daftar soal; soal yang tidak lengkap dibuang. */
export function rapikanSoal(soal) {
  if (!Array.isArray(soal)) return []
  return soal
    .map((s) => {
      const opsi = (Array.isArray(s?.opsi) ? s.opsi : []).map((o) => String(o ?? '').trim())
      return {
        detik: Math.max(1, Math.round(Number(s?.detik) || 0)),
        pertanyaan: String(s?.pertanyaan ?? '').trim(),
        opsi,
        jawaban: Number.isInteger(s?.jawaban) ? s.jawaban : 0,
        penjelasan: String(s?.penjelasan ?? '').trim(),
      }
    })
    .filter((s) => s.pertanyaan && s.opsi.filter(Boolean).length >= 2 && s.opsi[s.jawaban])
    .sort((a, b) => a.detik - b.detik)
    .slice(0, SOAL_MAKS_PER_VIDEO)
}

/** Pesan kesalahan untuk satu soal di editor dosen, atau '' bila sudah benar. */
export function periksaSoal(s, durasi = 0) {
  if (!String(s?.pertanyaan || '').trim()) return 'Pertanyaan belum diisi.'
  const opsi = (s.opsi || []).map((o) => String(o || '').trim())
  if (opsi.slice(0, JUMLAH_PILIHAN).filter(Boolean).length < JUMLAH_PILIHAN) return `Isi kelima pilihan jawaban (A–E).`
  if (!opsi[s.jawaban]) return 'Pilihan yang ditandai benar masih kosong.'
  if (!(Number(s.detik) >= 1)) return 'Detik kemunculan belum diisi.'
  if (durasi > 0 && Number(s.detik) > durasi) return 'Detik kemunculan melebihi durasi video.'
  return ''
}

/** Saran jumlah soal: ±1 tiap 4 menit, minimal 1, maksimal 8. */
export function saranJumlahSoal(durasiDetik) {
  if (!durasiDetik) return null
  return Math.max(1, Math.min(8, Math.round(durasiDetik / 240)))
}

/** "125" → "2:05"; dipakai editor dan panel soal. */
export function formatDetik(detik) {
  const d = Math.max(0, Math.floor(Number(detik) || 0))
  const j = Math.floor(d / 3600)
  const m = Math.floor((d % 3600) / 60)
  const s = String(d % 60).padStart(2, '0')
  return j ? `${j}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** "2:05" / "1:02:05" / "125" → detik; NaN bila tidak bisa dibaca. */
export function bacaDetik(teks) {
  const t = String(teks ?? '').trim()
  if (!t) return NaN
  if (/^\d+$/.test(t)) return Number(t)
  const m = t.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/)
  if (!m) return NaN
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

/** Indeks soal pertama yang belum terjawab, atau -1. `soal` sudah urut. */
export function soalBerikutnya(soal, terjawab) {
  return soal.findIndex((_, i) => !terjawab.has(i))
}

/**
 * Keputusan pemutar untuk satu ketukan (dipanggil ±4×/detik).
 * @returns {{ aksi: 'lanjut'|'soal'|'kembali', indeks?: number, ke?: number, maks: number }}
 */
export function langkahPemutar({ soal, terjawab, waktu, maks }) {
  const i = soalBerikutnya(soal, terjawab)
  const batasSoal = i >= 0 ? soal[i].detik : Infinity
  // Lompat ke depan melewati bagian yang belum ditonton (atau melewati soal) → kembalikan.
  if (waktu > maks + TOLERANSI_LOMPAT && i >= 0) {
    return { aksi: 'kembali', ke: Math.min(maks, batasSoal), maks }
  }
  const maksBaru = Math.max(maks, Math.min(waktu, batasSoal))
  if (i >= 0 && waktu >= batasSoal - 0.25) return { aksi: 'soal', indeks: i, maks: maksBaru }
  return { aksi: 'lanjut', maks: maksBaru }
}

/** Awal segmen yang diputar ulang setelah jawaban salah. */
export const awalSegmen = (soal, i) => (i > 0 ? soal[i - 1].detik : 0)

/* ----------------------------- Penyimpanan lokal ---------------------------- */

export function bacaProgres(kunci) {
  if (!kunci) return { terjawab: new Set(), maks: 0 }
  try {
    const v = JSON.parse(localStorage.getItem(kunci) || '{}')
    return { terjawab: new Set(Array.isArray(v.terjawab) ? v.terjawab : []), maks: Number(v.maks) || 0 }
  } catch {
    return { terjawab: new Set(), maks: 0 }
  }
}

/**
 * Simpan progres digabung dengan yang sudah tersimpan (bisa dari tab lain): soal terjawab disatukan,
 * titik terjauh diambil yang terbesar. Tidak menulis bila tidak ada perubahan, agar tab lain
 * tidak menerima event `storage` yang sia-sia.
 */
export function simpanProgres(kunci, p) {
  if (!kunci) return
  try {
    const lama = bacaProgres(kunci)
    const terjawab = [...new Set([...lama.terjawab, ...p.terjawab])].sort((a, b) => a - b)
    const nilai = JSON.stringify({ terjawab, maks: Math.floor(Math.max(lama.maks, p.maks)) })
    if (localStorage.getItem(kunci) !== nilai) localStorage.setItem(kunci, nilai)
  } catch { /* penyimpanan diblokir: progres hanya di memori */ }
}

/* ------------------------------- Adapter video ------------------------------ */

let janjiYt = null
/** Muat YouTube IFrame API sekali per halaman. */
export function muatYoutubeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Tanpa browser'))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (janjiYt) return janjiYt
  janjiYt = new Promise((resolve, reject) => {
    const sebelumnya = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { sebelumnya?.(); resolve(window.YT) }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onerror = () => { janjiYt = null; reject(new Error('Gagal memuat pemutar YouTube')) }
    document.head.appendChild(s)
  })
  return janjiYt
}

/**
 * Antarmuka seragam untuk iframe YouTube dan <video>.
 * @returns {Promise<{ waktu(): number, durasi(): number, ke(d: number): void, putar(): void, jeda(): void, hapus(): void }>}
 */
export async function buatAdapter(el) {
  if (el.tagName === 'VIDEO') {
    return {
      waktu: () => el.currentTime || 0,
      durasi: () => el.duration || 0,
      ke: (d) => { el.currentTime = d },
      putar: () => { el.play?.().catch(() => {}) },
      jeda: () => el.pause(),
      hapus: () => {},
    }
  }
  const YT = await muatYoutubeApi()
  const player = await new Promise((resolve) => {
    const p = new YT.Player(el, { events: { onReady: () => resolve(p) } })
  })
  return {
    waktu: () => player.getCurrentTime?.() || 0,
    durasi: () => player.getDuration?.() || 0,
    ke: (d) => player.seekTo?.(d, true),
    putar: () => player.playVideo?.(),
    jeda: () => player.pauseVideo?.(),
    // Jangan destroy(): itu ikut membuang iframe milik materi. Cukup hentikan pemutaran.
    hapus: () => { try { player.pauseVideo?.() } catch { /* iframe sudah hilang */ } },
  }
}

/* ------------------------------- Panel soal --------------------------------- */

const HURUF = 'ABCDEF'

function el(tag, kelas, teks) {
  const e = document.createElement(tag)
  if (kelas) e.className = kelas
  if (teks !== undefined) e.textContent = teks
  return e
}

/**
 * Pasang perilaku interaktif pada satu video.
 * @param {HTMLElement} media   iframe YouTube (enablejsapi=1) atau <video>
 * @param {object[]} soalMentah daftar soal slide
 * @param {{ kunci?: string, onProgres?: (p: {terjawab: number, total: number}) => void }} opsi
 * @returns {() => void} pelepas
 */
export function pasangVideoInteraktif(media, soalMentah, { kunci, onProgres } = {}) {
  const soal = rapikanSoal(soalMentah)
  const figure = media.closest('figure') || media.parentElement
  const progres = bacaProgres(kunci)
  progres.terjawab = new Set([...progres.terjawab].filter((i) => i < soal.length))
  let adapter = null
  let timer = null
  let soalAktif = -1
  let dilepas = false

  const status = el('p', 'sx-vi-status')
  const panel = el('div', 'sx-vi-panel')
  panel.hidden = true
  figure.after(status, panel)

  const lapor = () => {
    const n = progres.terjawab.size
    status.textContent = n >= soal.length
      ? `✓ Semua ${soal.length} pertanyaan di video ini sudah terjawab.`
      : `Video ini berhenti ${soal.length}× untuk pertanyaan singkat. Terjawab ${n} dari ${soal.length}. Bagian yang belum ditonton tidak bisa dilewati.`
    status.classList.toggle('is-done', n >= soal.length)
    onProgres?.({ terjawab: n, total: soal.length })
  }

  const tutupPanel = () => { panel.hidden = true; panel.replaceChildren(); soalAktif = -1 }

  const tampilkanSoal = (i) => {
    soalAktif = i
    adapter?.jeda()
    const s = soal[i]
    panel.replaceChildren()
    panel.hidden = false
    panel.append(el('p', 'sx-vi-eyebrow', `Pertanyaan ${i + 1} dari ${soal.length} · menit ${formatDetik(s.detik)}`))
    panel.append(el('p', 'sx-vi-q', s.pertanyaan))
    const daftar = el('div', 'sx-vi-opts')
    const umpan = el('div', 'sx-vi-fb')
    s.opsi.forEach((o, oi) => {
      if (!o) return
      const b = el('button', 'sx-vi-opt')
      b.type = 'button'
      b.append(el('span', 'sx-opt-l', HURUF[oi]), el('span', '', o))
      b.addEventListener('click', () => jawab(oi, b, daftar, umpan))
      daftar.append(b)
    })
    panel.append(daftar, umpan)
    panel.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }

  const jawab = (oi, tombol, daftar, umpan) => {
    const i = soalAktif
    const s = soal[i]
    daftar.querySelectorAll('button').forEach((b) => { b.disabled = true })
    umpan.replaceChildren()
    if (oi === s.jawaban) {
      tombol.classList.add('is-correct')
      progres.terjawab.add(i)
      progres.maks = Math.max(progres.maks, s.detik)
      simpanProgres(kunci, progres)
      lapor()
      umpan.append(el('p', 'sx-vi-ok', 'Benar.'))
      if (s.penjelasan) umpan.append(el('p', '', s.penjelasan))
      const lanjut = el('button', 'sx-vi-btn', 'Lanjutkan video')
      lanjut.type = 'button'
      lanjut.addEventListener('click', () => { tutupPanel(); adapter?.putar() })
      umpan.append(lanjut)
      lanjut.focus?.()
    } else {
      tombol.classList.add('is-wrong')
      const mulai = awalSegmen(soal, i)
      umpan.append(el('p', 'sx-vi-no', `Belum tepat. Tonton lagi bagian ${formatDetik(mulai)}–${formatDetik(s.detik)}, lalu jawab kembali.`))
      // Penjelasan sengaja tidak ditampilkan di sini agar jawaban tidak bocor; peserta harus menyimak ulang.
      const ulang = el('button', 'sx-vi-btn', 'Putar ulang bagian ini')
      ulang.type = 'button'
      ulang.addEventListener('click', () => { tutupPanel(); adapter?.ke(mulai); adapter?.putar() })
      umpan.append(ulang)
      ulang.focus?.()
    }
  }

  const ketuk = () => {
    if (!adapter || dilepas) return
    if (progres.terjawab.size >= soal.length) return // semua terjawab: bebas memutar
    const t = adapter.waktu()
    if (soalAktif >= 0) {
      // Saat soal terbuka, video tetap di titik soal.
      if (Math.abs(t - soal[soalAktif].detik) > TOLERANSI_LOMPAT) adapter.ke(soal[soalAktif].detik)
      adapter.jeda()
      return
    }
    const r = langkahPemutar({ soal, terjawab: progres.terjawab, waktu: t, maks: progres.maks })
    if (r.maks > progres.maks + 3) { progres.maks = r.maks; simpanProgres(kunci, progres) } else progres.maks = r.maks
    if (r.aksi === 'kembali') adapter.ke(r.ke)
    else if (r.aksi === 'soal') tampilkanSoal(r.indeks)
  }

  lapor()
  if (soal.length > 0) {
    buatAdapter(media)
      .then((a) => {
        if (dilepas) { a.hapus(); return }
        adapter = a
        timer = setInterval(ketuk, 250)
      })
      .catch(() => { status.textContent = 'Pemutar interaktif gagal dimuat. Muat ulang halaman untuk mencoba lagi.' })
  }

  return () => {
    dilepas = true
    clearInterval(timer)
    simpanProgres(kunci, progres)
    adapter?.hapus()
    status.remove()
    panel.remove()
  }
}
