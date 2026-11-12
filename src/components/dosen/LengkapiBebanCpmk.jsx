import { useEffect, useMemo, useState } from 'react'
import { X, Loader2, Bot, Wand2, Save, AlertTriangle, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { generateSaranBebanCpmk } from '@/lib/ai'
import { JENIS_AKTIVITAS, JENIS_MATERI, formatDurasi, formatJam } from '@/lib/bebanBelajar'
import {
  barisAktivitas, ringkasBaris, dataUntukAi, normalkanSaranAi, terapkanSaran,
  isiMenitOtomatis, daftarPerubahan, menitTerhitung, MENIT_MAKS,
} from '@/lib/lengkapiBeban'

const LABEL_KATEGORI = Object.fromEntries(JENIS_AKTIVITAS.map((j) => [j.key, j.label]))
LABEL_KATEGORI.materi = 'Materi'
const JUDUL_GRUP = { materi: 'Materi', forum: 'Forum diskusi', tugas: 'Tugas / proyek', kuis: 'Kuis & latihan', evaluasi: 'Evaluasi akhir' }
// callAi melaporkan teks biasa, atau { type: 'chunk', text } saat jawaban mengalir.
function teksProgres(t) {
  if (typeof t === 'string') return t
  const n = (String(t?.text || '').match(/"id"\s*:/g) || []).length
  return n ? `Menerima saran AI… ${n} aktivitas` : 'Menerima saran AI…'
}

const SUMBER = {
  isi: { teks: 'dari isi slide', warna: '#047857' },
  ai: { teks: 'saran AI', warna: '#7c3aed' },
}

/**
 * Satu layar untuk mengisi estimasi menit, jenis aktivitas, dan CPMK seluruh aktivitas kursus.
 * Menit materi SPA dihitung dari isinya; AI hanya menyarankan, dosen menyunting sebelum menyimpan.
 */
export default function LengkapiBebanCpmk({ course, onClose, onSaved }) {
  const cpmkList = useMemo(() => (course.cpmk || []).filter((c) => c?.kode), [course.cpmk])
  const [awal, setAwal] = useState(null)
  const [baris, setBaris] = useState(null)
  const [galat, setGalat] = useState('')
  const [proses, setProses] = useState('')   // teks progres AI / simpan
  const [timpa, setTimpa] = useState(false)

  useEffect(() => {
    let batal = false
    const id = course.id
    Promise.all([
      supabase.from('materials').select('id,title,description,week_number,estimasi_menit,jenis_aktivitas,cpmk_kode,webslide_content,attachments,webview_link,mime_type').eq('course_id', id).order('week_number').order('created_at'),
      supabase.from('assignments').select('id,title,description,estimasi_menit,cpmk_kode').eq('course_id', id).order('created_at'),
      supabase.from('exams').select('id,title,type,exam_mode,duration_minutes,estimasi_menit,cpmk_kode').eq('course_id', id).order('created_at'),
      supabase.from('forums').select('id,title,body,estimasi_menit,cpmk_kode').eq('course_id', id).order('created_at'),
    ]).then(([m, a, e, f]) => {
      if (batal) return
      const err = m.error || a.error || e.error || f.error
      if (err) { setGalat(err.message); return }
      const b = barisAktivitas({ materials: m.data, assignments: a.data, exams: e.data, forums: f.data })
      setAwal(b)
      setBaris(b)
    })
    return () => { batal = true }
  }, [course.id])

  const ringkas = useMemo(() => (baris ? ringkasBaris(baris, cpmkList, course.credits) : null), [baris, cpmkList, course.credits])
  const perubahan = useMemo(() => (baris && awal ? daftarPerubahan(baris, awal) : []), [baris, awal])
  const adaOtomatis = baris?.some((b) => b.otomatis && (timpa || b.menit == null))

  const ubahBaris = (kunci, patch) => setBaris((bs) => bs.map((b) => (b.kunci === kunci ? { ...b, ...patch } : b)))
  const toggleCpmk = (b, kode) => {
    const s = new Set(b.cpmk)
    if (s.has(kode)) s.delete(kode); else s.add(kode)
    ubahBaris(b.kunci, { cpmk: cpmkList.map((c) => c.kode).filter((k) => s.has(k)), sumberCpmk: null })
  }

  const tutup = () => {
    if (perubahan.length && !window.confirm(`${perubahan.length} perubahan belum disimpan. Tutup tanpa menyimpan?`)) return
    onClose()
  }

  const isiOtomatis = () => {
    setBaris((bs) => isiMenitOtomatis(bs, { timpa }))
    toast.success('Menit materi slide diisi dari isinya')
  }

  const mintaSaranAi = async () => {
    if (!cpmkList.length) { toast.error('Kursus belum punya CPMK. Rumuskan dulu di tab Generator RPS.'); return }
    setProses('Meminta saran AI…')
    try {
      const res = await generateSaranBebanCpmk({
        kursus: course.name,
        sks: course.credits,
        cpmk: cpmkList.map((c) => ({ kode: c.kode, deskripsi: c.deskripsi })),
        aktivitas: dataUntukAi(baris),
      }, (t) => setProses(teksProgres(t)))
      const saran = normalkanSaranAi(res, baris, cpmkList.map((c) => c.kode))
      if (!saran.size) throw new Error('AI tidak mengembalikan saran yang bisa dipakai. Coba lagi.')
      setBaris((bs) => terapkanSaran(bs, saran, { timpa }))
      toast.success(`Saran AI untuk ${saran.size} aktivitas. Periksa sebelum menyimpan.`)
    } catch (e) {
      toast.error(e?.message || 'Saran AI gagal')
    } finally {
      setProses('')
    }
  }

  const simpan = async () => {
    if (!perubahan.length) return
    setProses('Menyimpan…')
    const hasil = await Promise.all(perubahan.map(({ tabel, id, patch }) => supabase.from(tabel).update(patch).eq('id', id)))
    const gagal = hasil.filter((r) => r.error)
    setProses('')
    if (gagal.length) {
      toast.error(`${gagal.length} dari ${perubahan.length} aktivitas gagal disimpan: ${gagal[0].error.message}`)
      // Anggap yang berhasil sudah tersimpan agar bisa dicoba ulang hanya yang gagal.
      const gagalId = new Set(perubahan.filter((_, i) => hasil[i].error).map((p) => `${p.tabel}:${p.id}`))
      setAwal((as) => as.map((a) => (gagalId.has(a.kunci) ? a : baris.find((b) => b.kunci === a.kunci) || a)))
      onSaved?.()
      return
    }
    toast.success(`${perubahan.length} aktivitas disimpan`)
    setAwal(baris)
    onSaved?.()
  }

  const sibuk = !!proses
  const persen = ringkas?.targetMenit ? Math.min(100, Math.round((ringkas.totalMenit / ringkas.targetMenit) * 100)) : 0
  const grup = baris ? Object.keys(JUDUL_GRUP).map((k) => [k, baris.filter((b) => b.kategori === k)]).filter(([, bs]) => bs.length) : []

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Lengkapi beban dan CPMK">
      <div className="modal" style={{ maxWidth: 1080, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <span className="modal-title">Lengkapi beban &amp; CPMK</span>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>Estimasi waktu peserta dan CPMK untuk semua aktivitas kursus, sekaligus.</div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={tutup} aria-label="Tutup"><X size={14} /></button>
        </div>

        {ringkas && (
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--gray-200)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 20, color: 'var(--gray-900)' }}>{formatJam(ringkas.totalMenit)} jam</strong>
              <span style={{ fontSize: 12, color: 'var(--gray-600)' }}>
                {ringkas.targetMenit ? `dari target ${formatJam(ringkas.targetMenit)} jam (${course.credits} SKS)` : 'SKS kursus belum diisi'}
                {ringkas.belumDiisi > 0 && <span style={{ color: '#b45309' }}> · {ringkas.belumDiisi} belum diisi</span>}
              </span>
            </div>
            {ringkas.targetMenit > 0 && (
              <div role="progressbar" aria-valuenow={persen} aria-valuemin={0} aria-valuemax={100} aria-label="Pemenuhan beban belajar"
                style={{ height: 6, background: 'var(--gray-100)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${persen}%`, height: '100%', background: persen >= 100 ? '#059669' : '#d97706' }} />
              </div>
            )}
            {ringkas.cakupan.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ringkas.cakupan.map((c) => (
                  <span key={c.kode} title={c.deskripsi} style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                    color: c.jumlah ? '#065f46' : '#991b1b', background: c.jumlah ? '#ecfdf5' : '#fef2f2', border: `1px solid ${c.jumlah ? '#a7f3d0' : '#fecaca'}` }}>
                    {c.kode} · {c.jumlah ? `${c.jumlah} aktivitas` : 'belum ada'}
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="btn btn-primary btn-sm" style={{ gap: 6 }} onClick={mintaSaranAi} disabled={sibuk || !baris.length}>
                {proses && proses !== 'Menyimpan…' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Bot size={13} />} Saran AI (CPMK &amp; menit)
              </button>
              <button type="button" className="btn btn-secondary btn-sm" style={{ gap: 6 }} onClick={isiOtomatis} disabled={sibuk || !adaOtomatis}
                title="Hitung menit materi slide dari jumlah kata, video, dan soal">
                <Wand2 size={13} /> Hitung menit dari isi slide
              </button>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-600)', cursor: 'pointer' }}>
                <input type="checkbox" checked={timpa} onChange={(e) => setTimpa(e.target.checked)} style={{ accentColor: 'var(--indigo-600)' }} />
                Timpa yang sudah terisi
              </label>
              {proses && <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{proses}</span>}
            </div>
          </div>
        )}

        <div className="modal-body" style={{ gap: 18 }}>
          {!baris && !galat && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gray-500)', fontSize: 13 }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Memuat aktivitas…
            </div>
          )}
          {galat && <p style={{ margin: 0, color: 'var(--danger)', fontSize: 13 }}>Aktivitas tidak dapat dimuat: {galat}</p>}
          {baris && !baris.length && <p style={{ margin: 0, fontSize: 13, color: 'var(--gray-500)' }}>Kursus ini belum punya materi, tugas, ujian, atau forum.</p>}
          {baris && !cpmkList.length && (
            <p style={{ margin: 0, fontSize: 12, color: '#b45309', display: 'flex', gap: 6 }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> Kursus belum punya CPMK — menit tetap bisa diisi, tetapi pemetaan CPMK perlu dirumuskan dulu di tab Generator RPS.
            </p>
          )}

          {grup.map(([kategori, bs]) => (
            <section key={kategori}>
              <h4 style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--gray-500)' }}>
                {JUDUL_GRUP[kategori]} · {bs.length} · {formatDurasi(bs.reduce((n, b) => n + (menitTerhitung(b) || 0), 0))}
              </h4>
              <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden' }}>
                {bs.map((b, i) => (
                  <BarisAktivitas key={b.kunci} b={b} atas={i > 0} cpmkList={cpmkList} sibuk={sibuk}
                    onUbah={(p) => ubahBaris(b.kunci, p)} onToggle={(k) => toggleCpmk(b, k)} />
                ))}
              </div>
            </section>
          ))}

          {baris?.length > 0 && (
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--gray-500)', display: 'flex', gap: 6 }}>
              <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              Menit materi slide = waktu baca minimum × 2 (memahami &amp; mencatat) + video + soal. Ujian tanpa estimasi dihitung dari durasinya.
              Isi angka yang realistis: jam ini dibekukan ke sertifikat dan dapat diperiksa asesor RPL.
            </p>
          )}
        </div>

        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: perubahan.length ? '#b45309' : 'var(--gray-500)' }}>
            {perubahan.length ? `${perubahan.length} aktivitas berubah, belum disimpan` : 'Tidak ada perubahan'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={tutup} disabled={sibuk}>Tutup</button>
            <button type="button" className="btn btn-primary btn-sm" style={{ gap: 6 }} onClick={simpan} disabled={sibuk || !perubahan.length}>
              {proses === 'Menyimpan…' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />} Simpan semua
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function BarisAktivitas({ b, atas, cpmkList, sibuk, onUbah, onToggle }) {
  const sumber = SUMBER[b.sumberMenit]
  const idMenit = `lb-menit-${b.kunci}`
  const placeholder = b.tabel === 'exams' && b.durasi ? String(b.durasi) : b.otomatis ? String(b.otomatis.menit) : '—'
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', padding: '12px 14px', borderTop: atas ? '1px solid var(--gray-100)' : 'none', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-900)', lineHeight: 1.35 }}>
          {b.pekan ? <span style={{ color: 'var(--gray-500)', fontWeight: 700, marginRight: 6 }}>P{b.pekan}</span> : null}
          {b.judul}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginTop: 3 }}>
          {b.otomatis ? `Isi slide: ${b.otomatis.rincian}` : b.tabel === 'exams' && b.durasi ? `Durasi ujian ${b.durasi} menit` : LABEL_KATEGORI[b.kategori]}
        </div>
        {b.alasanAi && <div style={{ fontSize: 11.5, color: '#7c3aed', marginTop: 3 }}>AI: {b.alasanAi}</div>}
      </div>

      <div style={{ flex: '0 0 auto', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ width: 96 }}>
          <label htmlFor={idMenit} style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>Menit</label>
          <input id={idMenit} className="input" type="number" min={0} max={MENIT_MAKS} step={5} disabled={sibuk}
            style={{ padding: '6px 8px', fontSize: 13, borderColor: menitTerhitung(b) == null ? '#fcd34d' : undefined }}
            placeholder={placeholder} value={b.menit ?? ''}
            onChange={(e) => onUbah({ menit: e.target.value === '' ? null : Math.min(MENIT_MAKS, Math.max(0, Math.round(+e.target.value))), sumberMenit: null })} />
          {sumber && <div style={{ fontSize: 10.5, color: sumber.warna, marginTop: 2 }}>{sumber.teks}</div>}
        </div>
        {b.tabel === 'materials' && (
          <div style={{ width: 130 }}>
            <label htmlFor={`lb-jenis-${b.kunci}`} style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>Jenis</label>
            <select id={`lb-jenis-${b.kunci}`} className="input" disabled={sibuk} style={{ padding: '6px 8px', fontSize: 13 }}
              value={b.jenisMateri || ''} onChange={(e) => onUbah({ jenisMateri: e.target.value || null })}>
              <option value="">Otomatis ({LABEL_KATEGORI[b.jenisTebakan]?.split(' ')[0] || 'bacaan'})</option>
              {JENIS_MATERI.map((j) => <option key={j.key} value={j.key}>{j.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {cpmkList.length > 0 && (
        <div style={{ flex: '1 1 220px' }} role="group" aria-label={`CPMK untuk ${b.judul}`}>
          <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600, marginBottom: 4 }}>
            CPMK{b.sumberCpmk === 'ai' && <span style={{ color: '#7c3aed', fontWeight: 500 }}> · saran AI</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {cpmkList.map((c) => {
              const aktif = b.cpmk.includes(c.kode)
              return (
                <button key={c.kode} type="button" disabled={sibuk} aria-pressed={aktif} title={c.deskripsi} onClick={() => onToggle(c.kode)}
                  style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${aktif ? 'var(--indigo-600)' : 'var(--gray-200)'}`,
                    background: aktif ? 'var(--indigo-600)' : 'transparent', color: aktif ? '#fff' : 'var(--gray-600)' }}>
                  {c.kode.replace(/^CPMK-?/i, 'CPMK-')}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
