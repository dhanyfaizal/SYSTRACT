// Tab "Generator RPS & slide (AI)": deskripsi, CPL/CPMK, rencana 16 pertemuan, dan referensi.
// Draf AI disimpan di state komponen ini sampai instruktur menyimpannya ke kursus. Halaman induk
// memuat komponen ini saat tab pertama kali dibuka lalu tetap memasangnya (disembunyikan saat tab
// lain aktif), sehingga draf yang belum disimpan tidak hilang ketika berpindah tab.
import { useState } from 'react'
import { Plus, Trash2, Loader2, X, BookMarked, Bot, Info, Award, Clock, Link, ExternalLink, BookOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth'
import { useConfirm } from '@/components/ui/useConfirm'
import { generateCourseDescription, generateCplForCourse, generateCpmk, generateWeeklyPlan, generateReferences } from '@/lib/ai'

/**
 * @param {object}   course              kursus terpilih
 * @param {Function} onCourseBerubah     muat ulang data kursus setelah disimpan
 * @param {Function} onMaterialsBerubah  muat ulang materi setelah rencana pertemuan diterapkan
 * @param {Function} onKeSilabus         pindah ke tab Silabus & materi
 */
export default function TabGeneratorRps({ course, onCourseBerubah, onMaterialsBerubah, onKeSilabus }) {
  const { user } = useAuth()
  const { confirmDialog, showConfirm } = useConfirm()
  const selectedCourse = course

  // ── AI Assistant states ─────────────────────────────────────
  const [aiProgressText, setAiProgressText] = useState('')
  const [aiGeneratingDesc, setAiGeneratingDesc] = useState(false)
  const [aiGeneratingCplCpmk, setAiGeneratingCplCpmk] = useState(false)
  const [aiGeneratingWeekly, setAiGeneratingWeekly] = useState(false)
  const [aiGeneratingRefs, setAiGeneratingRefs] = useState(false)
  const [aiActiveStep, setAiActiveStep] = useState(1)

  // Temp local state for generated AI content before saving to course
  const [tempDesc, setTempDesc] = useState('')
  const [topicsInput, setTopicsInput] = useState('')
  const [topicsModal, setTopicsModal] = useState(false)
  const [tempCpl, setTempCpl] = useState([])
  const [tempCpmk, setTempCpmk] = useState([])
  const [tempWeekly, setTempWeekly] = useState([])
  const [tempRefs, setTempRefs] = useState([])
  const [newRefText, setNewRefText] = useState('')
  const [newRefUrl, setNewRefUrl] = useState('')

  // Isi ulang draf dari data kursus setiap kali data kursus dimuat ulang (mis. setelah disimpan).
  const [sumber, setSumber] = useState(null)
  if (course && course !== sumber) {
    setSumber(course)
    setTempDesc(course.description || '')
    setTempCpl(course.cpl || [])
    setTempCpmk(course.cpmk || [])
    setTempWeekly(course.weekly_plan || [])
    setTempRefs(course.referensi || [])
  }

  const handleAiProgress = (event) => {
    if (typeof event === 'string') {
      setAiProgressText(event)
    } else if (event && event.type === 'chunk') {
      const chars = event.text.length
      setAiProgressText(`AI sedang merumuskan konten... (${chars.toLocaleString('id-ID')} karakter)`)
    }
  }

  // ── AI Assistant Actions ─────────────────────────────────────
  async function handleAiGenerateDesc() {
    setTopicsModal(false)
    setAiGeneratingDesc(true)
    setAiProgressText("Menganalisis Nama Kursus & Topik...")
    try {
      const res = await generateCourseDescription(selectedCourse.name, topicsInput, handleAiProgress)
      if (res && res.deskripsi) {
        setTempDesc(res.deskripsi)
        toast.success("Deskripsi kursus berhasil dirumuskan AI! 🤖")
      } else {
        throw new Error("Hasil deskripsi kosong.")
      }
    } catch (err) {
      toast.error("Gagal generate deskripsi: " + err.message)
    } finally {
      setAiGeneratingDesc(false)
      setAiProgressText('')
    }
  }

  async function handleSaveDesc() {
    const { error } = await supabase
      .from('courses')
      .update({ description: tempDesc })
      .eq('id', selectedCourse.id)

    if (error) {
      toast.error("Gagal menyimpan deskripsi: " + error.message)
    } else {
      toast.success("Deskripsi berhasil disimpan!")
      onCourseBerubah?.()
    }
  }

  async function handleAiGenerateCplCpmk() {
    setAiGeneratingCplCpmk(true)
    setAiProgressText("Mengambil data CPL prodi kurikulum...")
    try {
      const cpls = await generateCplForCourse(selectedCourse.name, [], handleAiProgress)
      setTempCpl(cpls || [])

      setAiProgressText("Menganalisis keterkaitan CPL dan merumuskan CPMK...")
      const cpmks = await generateCpmk(selectedCourse.name, tempDesc || selectedCourse.description, cpls, handleAiProgress)
      setTempCpmk(cpmks || [])

      toast.success("CPL & CPMK berhasil disusun AI! 🎯")
    } catch (err) {
      toast.error("Gagal generate CPL/CPMK: " + err.message)
    } finally {
      setAiGeneratingCplCpmk(false)
      setAiProgressText('')
    }
  }

  async function handleSaveCplCpmk() {
    const { error } = await supabase
      .from('courses')
      .update({ cpl: tempCpl, cpmk: tempCpmk })
      .eq('id', selectedCourse.id)

    if (error) {
      if (error.message?.includes('column')) {
        toast.error('⚠️ Struktur database belum sesuai versi aplikasi. Hubungi admin SYSTRACT.', { duration: 6000 })
      } else {
        toast.error("Gagal menyimpan CPL & CPMK: " + error.message)
      }
    } else {
      toast.success("CPL & CPMK berhasil disimpan ke kursus!")
      onCourseBerubah?.()
    }
  }

  async function handleAiGenerateWeekly() {
    setAiGeneratingWeekly(true)
    setAiProgressText("Menganalisis CPMK & menyusun outline silabus 16 pertemuan...")
    try {
      const list = await generateWeeklyPlan(
        selectedCourse.name,
        tempDesc || selectedCourse.description,
        tempCpmk.length > 0 ? tempCpmk : selectedCourse.cpmk || [],
        selectedCourse.credits || 3,
        handleAiProgress
      )
      setTempWeekly(list || [])
      toast.success("Outline 16 pertemuan berhasil disusun AI! 📅")
    } catch (err) {
      toast.error("Gagal generate silabus: " + err.message)
    } finally {
      setAiGeneratingWeekly(false)
      setAiProgressText('')
    }
  }

  function handleUpdateCplItem(index, value) {
    setTempCpl(prev => {
      const updated = [...prev]
      updated[index] = value
      return updated
    })
  }

  function handleAddCplItem() {
    setTempCpl(prev => [...prev, 'Mampu merancang dan mengimplementasikan...'])
  }

  function handleRemoveCplItem(index) {
    setTempCpl(prev => prev.filter((_, idx) => idx !== index))
  }

  function handleUpdateCpmkItem(index, key, value) {
    setTempCpmk(prev => {
      const updated = [...prev]
      if (key === 'cpl_ref') {
        const refs = value.split(',').map(s => s.trim()).filter(Boolean)
        updated[index] = { ...updated[index], cpl_ref: refs }
      } else {
        updated[index] = { ...updated[index], [key]: value }
      }
      return updated
    })
  }

  function handleAddCpmkItem() {
    setTempCpmk(prev => [
      ...prev,
      {
        kode: `CPMK-${prev.length + 1}`,
        deskripsi: 'Mahasiswa mampu...',
        cpl_ref: []
      }
    ])
  }

  function handleRemoveCpmkItem(index) {
    setTempCpmk(prev => {
      const filtered = prev.filter((_, idx) => idx !== index)
      return filtered.map((item, idx) => ({
        ...item,
        kode: `CPMK-${idx + 1}`
      }))
    })
  }

  function handleUpdateRefItemText(index, value) {
    setTempRefs(prev => {
      const updated = [...prev]
      const current = updated[index]
      if (typeof current === 'object' && current !== null) {
        updated[index] = { ...current, teks: value }
      } else {
        updated[index] = { teks: value, url: '' }
      }
      return updated
    })
  }

  function handleUpdateRefItemUrl(index, value) {
    setTempRefs(prev => {
      const updated = [...prev]
      const current = updated[index]
      if (typeof current === 'object' && current !== null) {
        updated[index] = { ...current, url: value }
      } else {
        updated[index] = { teks: current || '', url: value }
      }
      return updated
    })
  }

  function _handleAddRefItem() {
    setTempRefs(prev => [...prev, { teks: 'Nama Penulis. (Tahun). Judul Buku. Penerbit.', url: '' }])
  }

  function handleRemoveRefItem(index) {
    setTempRefs(prev => prev.filter((_, idx) => idx !== index))
  }

  function handleUpdateWeeklyItem(index, key, value) {
    setTempWeekly(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [key]: value }
      return updated
    })
  }

  function handleAddWeeklyItem() {
    setTempWeekly(prev => {
      const nextNo = prev.length + 1
      const isUts = nextNo === 8
      const isUas = nextNo === 16
      let bahanKajian = ''
      let kemampuanAkhir = ''
      if (isUts) {
        bahanKajian = 'Ujian Tengah Semester (UTS)'
        kemampuanAkhir = 'Melakukan evaluasi tengah semester untuk mengukur pemahaman mahasiswa terhadap materi pertemuan 1-7'
      } else if (isUas) {
        bahanKajian = 'Ujian Akhir Semester (UAS)'
        kemampuanAkhir = 'Melakukan evaluasi akhir semester untuk mengukur pemahaman mahasiswa terhadap materi pertemuan 9-15'
      }
      return [
        ...prev,
        {
          no: nextNo,
          bahan_kajian: bahanKajian,
          kemampuan_akhir: kemampuanAkhir,
          waktu: 170,
          bobot: isUts || isUas ? 15 : 5,
          is_uts: isUts,
          is_uas: isUas
        }
      ]
    })
  }

  function handleRemoveWeeklyItem(index) {
    setTempWeekly(prev => {
      const filtered = prev.filter((_, idx) => idx !== index)
      return filtered.map((item, idx) => {
        const newNo = idx + 1
        const isUts = newNo === 8
        const isUas = newNo === 16
        return {
          ...item,
          no: newNo,
          bahan_kajian: item.bahan_kajian,
          kemampuan_akhir: item.kemampuan_akhir,
          waktu: item.waktu,
          bobot: item.bobot,
          is_uts: isUts,
          is_uas: isUas
        }
      })
    })
  }

  async function handleSaveWeeklyDraft() {
    if (!selectedCourse) return
    const loader = toast.loading("Menyimpan draf silabus...")
    try {
      const { error } = await supabase
        .from('courses')
        .update({ weekly_plan: tempWeekly })
        .eq('id', selectedCourse.id)

      if (error) {
        if (error.message?.includes('column')) {
          throw new Error('Struktur database belum sesuai versi aplikasi (kolom weekly_plan). Hubungi admin SYSTRACT.')
        }
        throw error
      }
      toast.success("Draf silabus berhasil disimpan!", { id: loader })
      onCourseBerubah?.()
    } catch (err) {
      toast.error("Gagal menyimpan draf silabus: " + err.message, { id: loader })
    }
  }

  async function handleApplyWeekly() {
    if (tempWeekly.length === 0) return
    const ok = await showConfirm({
      title: 'Terapkan Rencana Pembelajaran?',
      message: 'Ini akan menghapus semua materi/pertemuan yang ada saat ini untuk kelas ini dan menggantinya dengan pertemuan baru dari rancangan silabus Anda. Lanjutkan?',
      confirmLabel: 'Ya, Ganti',
      variant: 'danger'
    })
    if (!ok) return

    const rows = tempWeekly.map(w => ({
      course_id: selectedCourse.id,
      title: w.bahan_kajian || `Materi Pertemuan ${w.no}`,
      description: w.kemampuan_akhir || `Kemampuan akhir pertemuan ${w.no}`,
      week_number: w.no,
      uploaded_by: user.id
    }))

    const loader = toast.loading("Menerapkan rencana pembelajaran ke silabus...")
    try {
      const { error: delErr } = await supabase.from('materials').delete().eq('course_id', selectedCourse.id)
      if (delErr) throw delErr

      const { error: insErr } = await supabase.from('materials').insert(rows)
      if (insErr) throw insErr

      // Auto-save the weekly plan draft to database as well
      await supabase.from('courses').update({ weekly_plan: tempWeekly }).eq('id', selectedCourse.id)

      toast.success("Silabus pertemuan berhasil diterapkan! 🚀", { id: loader })
      onCourseBerubah?.()
      onKeSilabus?.()
      onMaterialsBerubah?.()
    } catch (err) {
      toast.error("Gagal menerapkan silabus: " + err.message, { id: loader })
    }
  }

  async function handleAiGenerateRefs() {
    setAiGeneratingRefs(true)
    setAiProgressText("Mencari referensi buku teks & jurnal ilmiah mutakhir...")
    try {
      const refs = await generateReferences(
        selectedCourse.name,
        tempCpmk.length > 0 ? tempCpmk : selectedCourse.cpmk || [],
        handleAiProgress
      )
      setTempRefs(prev => {
        const existing = Array.isArray(prev) ? prev : [];
        return [...existing, ...(refs || [])];
      })
      toast.success("Rekomendasi pustaka berhasil dirumuskan AI! 📚")
    } catch (err) {
      toast.error("Gagal generate referensi: " + err.message)
    } finally {
      setAiGeneratingRefs(false)
      setAiProgressText('')
    }
  }

  async function handleSaveRefs() {
    const { error } = await supabase
      .from('courses')
      .update({ referensi: tempRefs })
      .eq('id', selectedCourse.id)

    if (error) {
      if (error.message?.includes('column')) {
        toast.error('⚠️ Struktur database belum sesuai versi aplikasi. Hubungi admin SYSTRACT.', { duration: 6000 })
      } else {
        toast.error("Gagal menyimpan referensi: " + error.message)
      }
    } else {
      toast.success("Referensi pustaka berhasil disimpan!")
      onCourseBerubah?.()
    }
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {aiProgressText && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#eef2ff', borderColor: '#c7d2fe', color: 'var(--indigo-700)', padding: 14 }}>
            <Loader2 size={16} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{aiProgressText}</span>
          </div>
        )}

        {/* Stepper Header Navigation */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 20, 
          background: '#ffffff', 
          border: '1px solid var(--gray-200)', 
          borderRadius: 16, 
          padding: '24px 20px',
          position: 'relative',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          gap: 12
        }}>
          {/* Connecting Line */}
          <div style={{ 
            position: 'absolute', 
            top: 42, 
            left: '12%', 
            right: '12%', 
            height: 2, 
            background: 'var(--gray-200)', 
            zIndex: 0 
          }} />
          
          {[
            { step: 1, title: 'Mata Kuliah', desc: 'Detail Pengantar', isDone: !!tempDesc, icon: BookOpen },
            { step: 2, title: 'CPL & CPMK', desc: 'Target Kompetensi', isDone: tempCpmk.length > 0, icon: Award },
            { step: 3, title: 'Referensi', desc: 'Daftar Pustaka', isDone: tempRefs.length > 0, icon: BookMarked },
            { step: 4, title: '16 Pertemuan', desc: 'Struktur Silabus', isDone: tempWeekly.length > 0, icon: Clock }
          ].map((s) => {
            const isActive = aiActiveStep === s.step;
            const isDone = s.isDone;
            const IconComponent = s.icon;
            
            return (
              <div 
                key={s.step} 
                onClick={() => setAiActiveStep(s.step)}
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'center', 
                  gap: 8, 
                  cursor: 'pointer',
                  flex: 1,
                  justifyContent: 'center',
                  position: 'relative',
                  zIndex: 1
                }}
              >
                <div style={{ 
                  width: 36, 
                  height: 36, 
                  borderRadius: '50%', 
                  background: isActive ? '#ffffff' : isDone ? 'var(--indigo-600)' : '#ffffff',
                  color: isActive ? 'var(--indigo-600)' : isDone ? '#ffffff' : 'var(--gray-400)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: isActive ? '2px solid var(--indigo-600)' : isDone ? 'none' : '2px solid var(--gray-200)',
                  boxShadow: isActive ? '0 0 0 4px #e0e7ff' : 'none',
                  transition: 'all 0.2s',
                  flexShrink: 0
                }}>
                  {isDone && !isActive ? (
                    <span style={{ fontSize: 13, fontWeight: 'bold' }}>✓</span>
                  ) : (
                    <IconComponent size={15}/>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? 'var(--indigo-600)' : 'var(--gray-700)' }}>{s.title}</span>
                  <span style={{ fontSize: 9, color: 'var(--gray-400)', fontWeight: 500 }}>{s.desc}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step 1: Deskripsi Kursus */}
        {aiActiveStep === 1 && (
          <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Langkah 1: Deskripsi Kursus</span>
              <button
                className="btn btn-secondary btn-sm"
                style={{ gap: 4 }}
                onClick={() => {
                  setTopicsInput('')
                  setTopicsModal(true)
                }}
                disabled={aiGeneratingDesc}
              >
                <Bot size={13} color="var(--indigo-600)"/> Generate AI
              </button>
            </div>
            <textarea
              className="input"
              rows={6}
              style={{ fontSize: 13, lineHeight: 1.5 }}
              placeholder="Deskripsi kursus akan dihasilkan di sini oleh AI..."
              value={tempDesc}
              onChange={e => setTempDesc(e.target.value)}
            />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <div>
                {tempDesc !== selectedCourse.description && tempDesc.trim() !== '' && (
                  <button className="btn btn-primary btn-sm" onClick={handleSaveDesc}>
                    Simpan Deskripsi
                  </button>
                )}
              </div>
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={() => setAiActiveStep(2)}
                disabled={!tempDesc}
              >
                Lanjut ke CPMK & CPL &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 2: CPL & CPMK */}
        {aiActiveStep === 2 && (
          <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Langkah 2: Keterampilan & Capaian (CPL & CPMK)</span>
              <button className="btn btn-secondary btn-sm" style={{ gap: 4 }} onClick={handleAiGenerateCplCpmk} disabled={aiGeneratingCplCpmk || !tempDesc}>
                <Bot size={13} color="var(--indigo-600)"/> Generate CPL & CPMK
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* CPL Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)' }}>CPL yang Didukung (Bisa Diedit):</span>
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-sm" 
                    onClick={handleAddCplItem}
                    style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}
                  >
                    <Plus size={12} /> Tambah CPL
                  </button>
                </div>
                
                {tempCpl.length === 0 ? (
                  <div style={{ padding: '15px 0', textAlign: 'center', background: '#f8fafc', border: '1px dashed var(--gray-200)', borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Belum ada data CPL. Klik "Generate CPL & CPMK" atau "+ Tambah CPL".</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 8, padding: 8, background: '#f8fafc' }}>
                    {tempCpl.map((c, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#ffffff', border: '1px solid var(--gray-200)', padding: 6, borderRadius: 6 }}>
                        <span className="badge-pill badge-green" style={{ height: 24, fontSize: 10 }}>CPL-{idx+1}</span>
                        <input 
                          type="text" 
                          className="input" 
                          style={{ fontSize: 12, padding: '4px 8px', flex: 1 }}
                          value={c} 
                          onChange={e => handleUpdateCplItem(idx, e.target.value)} 
                          placeholder="Deskripsi Capaian Pembelajaran Lulusan..."
                        />
                        <button 
                          type="button" 
                          className="btn btn-ghost btn-icon btn-sm" 
                          style={{ color: 'var(--danger)', height: 24, width: 24 }}
                          onClick={() => handleRemoveCplItem(idx)}
                          title="Hapus CPL"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* CPMK Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)' }}>Rancangan CPMK (Bisa Diedit):</span>
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-sm" 
                    onClick={handleAddCpmkItem}
                    style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}
                  >
                    <Plus size={12} /> Tambah CPMK
                  </button>
                </div>
                
                {tempCpmk.length === 0 ? (
                  <div style={{ padding: '15px 0', textAlign: 'center', background: '#f8fafc', border: '1px dashed var(--gray-200)', borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Belum ada data CPMK. Klik "Generate CPL & CPMK" atau "+ Tambah CPMK".</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 250, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 8, padding: 8, background: '#f8fafc' }}>
                    {tempCpmk.map((c, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex', 
                          flexDirection: 'column', 
                          gap: 6, 
                          background: '#ffffff', 
                          border: '1px solid var(--gray-200)', 
                          padding: 10, 
                          borderRadius: 8 
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <input 
                            type="text" 
                            className="input" 
                            style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', width: 100, height: 28 }}
                            value={c.kode || `CPMK-${idx+1}`} 
                            onChange={e => handleUpdateCpmkItem(idx, 'kode', e.target.value)} 
                            placeholder="Kode CPMK"
                          />
                          <button 
                            type="button" 
                            className="btn btn-ghost btn-icon btn-sm" 
                            style={{ color: 'var(--danger)', height: 24, width: 24 }}
                            onClick={() => handleRemoveCpmkItem(idx)}
                            title="Hapus CPMK"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        
                        <div>
                          <textarea 
                            className="input" 
                            rows={2}
                            style={{ fontSize: 11, padding: '6px 8px', lineHeight: 1.4, resize: 'vertical' }}
                            value={c.deskripsi || ''} 
                            onChange={e => handleUpdateCpmkItem(idx, 'deskripsi', e.target.value)} 
                            placeholder="Deskripsi Capaian Pembelajaran Mata Kuliah..."
                          />
                        </div>
                        
                        <div>
                          <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--gray-500)', display: 'block', marginBottom: 2 }}>
                            Referensi CPL (koma dipisah, contoh: CPL-1, CPL-2)
                          </label>
                          <input 
                            type="text" 
                            className="input" 
                            style={{ fontSize: 11, padding: '4px 8px', height: 24 }}
                            value={c.cpl_ref ? c.cpl_ref.join(', ') : ''} 
                            onChange={e => handleUpdateCpmkItem(idx, 'cpl_ref', e.target.value)} 
                            placeholder="Contoh: CPL-1, CPL-2"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAiActiveStep(1)}>
                &larr; Kembali
              </button>
              
              <div style={{ display: 'flex', gap: 8 }}>
                {(tempCpl.length > 0 || tempCpmk.length > 0) && (
                  <button className="btn btn-primary btn-sm" onClick={handleSaveCplCpmk}>
                    Simpan ke Kursus
                  </button>
                )}
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => setAiActiveStep(3)}
                  disabled={tempCpmk.length === 0}
                >
                  Lanjut ke Referensi &rarr;
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Referensi Pustaka */}
        {aiActiveStep === 3 && (
          <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18, borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--gray-100)', paddingBottom: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--indigo-600)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Langkah 3: Referensi Pustaka</span>
                <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>Rancang daftar rujukan akademik utama kelas Anda</span>
              </div>
              <button 
                className="btn btn-secondary btn-sm" 
                style={{ 
                  gap: 6, 
                  padding: '6px 14px', 
                  borderRadius: 8, 
                  fontWeight: 600, 
                  border: '1px solid var(--indigo-200)', 
                  background: 'var(--indigo-50)', 
                  color: 'var(--indigo-700)',
                  transition: 'all 0.15s'
                }} 
                onClick={handleAiGenerateRefs} 
                disabled={aiGeneratingRefs || tempCpmk.length === 0}
              >
                <Bot size={13}/> {aiGeneratingRefs ? 'Generating...' : 'Rekomendasi Referensi AI'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Manual Add Reference Form (SIRA-SYS style) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--gray-50)', padding: 14, borderRadius: 12, border: '1px solid var(--gray-200)' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-600)' }}>Tambah Referensi Manual</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 260 }}>
                    <input
                      className="input"
                      style={{ fontSize: 12, height: 32, borderRadius: 6 }}
                      placeholder="Sitasi baru (contoh: Pressman, R. S. (2014). Software Engineering...)"
                      value={newRefText}
                      onChange={e => setNewRefText(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
                      <Link size={12} color="var(--gray-400)" style={{ position: 'absolute', left: 8 }}/>
                      <input
                        className="input"
                        style={{ fontSize: 11, height: 28, flex: 1, paddingLeft: 26, borderRadius: 6 }}
                        placeholder="Tautan URL Dokumen (opsional, cth: https://...)"
                        value={newRefUrl}
                        onChange={e => setNewRefUrl(e.target.value)}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ height: 32, gap: 4, fontSize: 12, padding: '0 16px', borderRadius: 8, background: 'var(--indigo-600)', alignSelf: 'flex-end' }}
                    onClick={() => {
                      if (!newRefText.trim()) {
                        toast.error("Sitasi tidak boleh kosong");
                        return;
                      }
                      setTempRefs(prev => [...prev, { teks: newRefText, url: newRefUrl }]);
                      setNewRefText('');
                      setNewRefUrl('');
                      toast.success("Referensi ditambahkan! 📚");
                    }}
                  >
                    <Plus size={14}/> Tambah
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-700)' }}>
                  Daftar Pustaka (Bisa Diedit):
                </span>
                
                {tempRefs.length === 0 ? (
                  <div style={{ padding: '30px 0', textAlign: 'center', background: '#f8fafc', border: '1px dashed var(--gray-200)', borderRadius: 12 }}>
                    <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Belum ada data referensi. Gunakan \"Rekomendasi Referensi AI\" atau form di atas.</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--gray-200)', borderRadius: 12, overflow: 'hidden', background: '#ffffff' }}>
                    {tempRefs.map((r, idx) => {
                      const isObj = typeof r === 'object' && r !== null;
                      const itemText = isObj ? (r.teks || '') : r;
                      const itemUrl = isObj ? (r.url || '') : '';
                      
                      const _isJurnal = itemText.toLowerCase().includes('journal') || 
                                       itemText.toLowerCase().includes('jurnal') || 
                                       itemText.toLowerCase().includes('doi:') || 
                                       itemUrl.toLowerCase().includes('doi.org') || 
                                       itemUrl.toLowerCase().includes('arxiv.org');

                      return (
                        <div 
                          key={idx} 
                          style={{ 
                            display: 'flex', 
                            gap: 12, 
                            alignItems: 'flex-start', 
                            padding: '12px 16px', 
                            borderBottom: idx === tempRefs.length - 1 ? 'none' : '1px solid var(--gray-100)',
                            background: idx % 2 === 0 ? 'var(--surface)' : 'var(--gray-50)',
                            transition: 'all 0.15s' 
                          }}
                        >
                          {/* Badge [1] */}
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--indigo-600)', marginTop: 4, width: 24, flexShrink: 0 }}>
                            [{idx + 1}]
                          </span>
                          
                          {/* Content */}
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <textarea
                              className="input"
                              rows={2}
                              style={{
                                fontSize: 11,
                                padding: '4px 6px',
                                lineHeight: 1.4,
                                resize: 'vertical',
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                boxShadow: 'none',
                                color: 'var(--gray-800)',
                                fontWeight: 500,
                                borderBottom: '1px dashed transparent',
                                transition: 'all 0.15s'
                              }}
                              onFocus={(e) => {
                                e.target.style.borderBottom = '1px dashed var(--indigo-400)';
                                e.target.style.background = '#ffffff';
                              }}
                              onBlur={(e) => {
                                e.target.style.borderBottom = '1px dashed transparent';
                                e.target.style.background = 'transparent';
                              }}
                              value={itemText}
                              onChange={e => handleUpdateRefItemText(idx, e.target.value)}
                              placeholder="Format APA Style..."
                            />
                            
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 6 }}>
                              <Link size={10} color="var(--gray-400)"/>
                              <input
                                type="text"
                                style={{
                                  fontSize: 10,
                                  color: 'var(--gray-500)',
                                  border: 'none',
                                  outline: 'none',
                                  background: 'transparent',
                                  flex: 1,
                                  borderBottom: '1px dashed transparent'
                                }}
                                onFocus={(e) => {
                                  e.target.style.borderBottom = '1px dashed var(--indigo-300)';
                                  e.target.style.color = 'var(--gray-700)';
                                }}
                                onBlur={(e) => {
                                  e.target.style.borderBottom = '1px dashed transparent';
                                  e.target.style.color = 'var(--gray-500)';
                                }}
                                placeholder="Tautan URL dokumen (opsional)..."
                                value={itemUrl}
                                onChange={e => handleUpdateRefItemUrl(idx, e.target.value)}
                              />
                            </div>
                          </div>
                          
                          {/* Action buttons on the right */}
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {itemUrl && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ height: 28, width: 28, borderRadius: 6, color: 'var(--indigo-600)' }}
                                onClick={() => {
                                  const target = itemUrl.startsWith('http://') || itemUrl.startsWith('https://') 
                                    ? itemUrl 
                                    : 'https://' + itemUrl;
                                  window.open(target, '_blank', 'noopener,noreferrer');
                                }}
                                title="Buka Tautan di Tab Baru"
                              >
                                <ExternalLink size={12}/>
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon btn-sm"
                              style={{ color: 'var(--danger)', height: 28, width: 28, borderRadius: 6 }}
                              onClick={() => handleRemoveRefItem(idx)}
                              title="Hapus Referensi"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAiActiveStep(2)}>
                &larr; Kembali
              </button>
              
              <div style={{ display: 'flex', gap: 8 }}>
                {tempRefs.length > 0 && (
                  <button className="btn btn-primary btn-sm" onClick={handleSaveRefs}>
                    Simpan Referensi
                  </button>
                )}
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => setAiActiveStep(4)}
                  disabled={tempRefs.length === 0}
                >
                  Lanjut ke Silabus &rarr;
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: 16 Pertemuan Silabus */}
        {aiActiveStep === 4 && (
          <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Langkah 4: Struktur Silabus (16 Pertemuan)</span>
              <button className="btn btn-secondary btn-sm" style={{ gap: 4 }} onClick={handleAiGenerateWeekly} disabled={aiGeneratingWeekly || tempCpmk.length === 0}>
                <Bot size={13} color="var(--indigo-600)"/> Generate 16 Pertemuan
              </button>
            </div>

            {tempWeekly.length === 0 && (
              <div style={{ padding: '30px 0', textAlign: 'center', background: '#f8fafc', border: '1px dashed var(--gray-200)', borderRadius: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Belum ada rancangan silabus 16 pertemuan. Klik "Generate 16 Pertemuan" untuk merumuskan draf silabus atau klik tombol "+ Tambah Pertemuan" di bawah.</span>
                <div style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddWeeklyItem} style={{ gap: 4 }}>
                    <Plus size={13} /> Tambah Pertemuan Pertama
                  </button>
                </div>
              </div>
            )}

            {tempWeekly.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)' }}>Rancangan Silabus Pertemuan (Bisa Diedit):</span>
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-sm" 
                    onClick={handleAddWeeklyItem}
                    style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}
                  >
                    <Plus size={12} /> Tambah Pertemuan
                  </button>
                </div>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: 12, 
                  marginTop: 4, 
                  maxHeight: 400, 
                  overflowY: 'auto', 
                  border: '1px solid var(--gray-200)', 
                  borderRadius: 8, 
                  padding: 12,
                  background: 'var(--gray-50)'
                }}>
                  {tempWeekly.map((w, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column',
                        gap: 8, 
                        background: w.is_uts || w.is_uas ? '#fff5f5' : '#ffffff', 
                        border: w.is_uts || w.is_uas ? '1px solid #feb2b2' : '1px solid var(--gray-200)',
                        padding: 12, 
                        borderRadius: 8, 
                        position: 'relative',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                      }}
                    >
                      {/* Row Header with Meeting No and Delete button */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 800, color: 'var(--indigo-600)', fontSize: 12 }}>
                          Pertemuan {w.no} {w.is_uts ? '(UTS)' : w.is_uas ? '(UAS)' : ''}
                        </span>
                        <button 
                          type="button" 
                          className="btn btn-ghost btn-icon btn-sm" 
                          style={{ color: 'var(--danger)', height: 24, width: 24 }}
                          onClick={() => handleRemoveWeeklyItem(idx)}
                          title="Hapus Pertemuan"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* Inputs */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-500)', display: 'block', marginBottom: 2 }}>Bahan Kajian (Materi / Topik) *</label>
                          <input 
                            type="text" 
                            className="input" 
                            style={{ fontSize: 12, padding: '6px 8px' }}
                            value={w.bahan_kajian || ''} 
                            onChange={e => handleUpdateWeeklyItem(idx, 'bahan_kajian', e.target.value)}
                            placeholder="Contoh: Pengenalan dasar pemrograman Python"
                          />
                        </div>
                        
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-500)', display: 'block', marginBottom: 2 }}>Kemampuan Akhir yang Diharapkan *</label>
                          <textarea 
                            className="input" 
                            rows={2}
                            style={{ fontSize: 11, padding: '6px 8px', lineHeight: 1.4, resize: 'vertical' }}
                            value={w.kemampuan_akhir || ''} 
                            onChange={e => handleUpdateWeeklyItem(idx, 'kemampuan_akhir', e.target.value)}
                            placeholder="Contoh: Mahasiswa mampu memahami sintaks dasar dan tipe data dalam Python"
                          />
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-500)', display: 'block', marginBottom: 2 }}>🕒 Waktu (Menit)</label>
                            <input 
                              type="number" 
                              className="input" 
                              style={{ fontSize: 12, padding: '6px 8px' }}
                              value={w.waktu || 170} 
                              onChange={e => handleUpdateWeeklyItem(idx, 'waktu', parseInt(e.target.value) || 0)}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-500)', display: 'block', marginBottom: 2 }}>⚖️ Bobot (%)</label>
                            <input 
                              type="number" 
                              className="input" 
                              style={{ fontSize: 12, padding: '6px 8px' }}
                              value={w.bobot || 0} 
                              onChange={e => handleUpdateWeeklyItem(idx, 'bobot', parseInt(e.target.value) || 0)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAiActiveStep(3)}>
                &larr; Kembali
              </button>
              
              <div style={{ display: 'flex', gap: 8 }}>
                {tempWeekly.length > 0 && (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={handleSaveWeeklyDraft}>
                      Simpan Draf Silabus
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={handleApplyWeekly}>
                      Terapkan ke Silabus / Materi Kelas
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* ── MODAL: Input Topik untuk Deskripsi ── */}
      {topicsModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520, borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }}>
            <div style={{ height: 4, background: 'linear-gradient(to right, var(--indigo-500), var(--purple-500))' }} />
            
            <div className="modal-header" style={{ padding: '16px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--gray-100)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--indigo-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={16} color="var(--indigo-600)"/>
                </div>
                <div>
                  <span className="modal-title" style={{ fontSize: 15, fontWeight: 700 }}>Fokus Materi Pengembangan</span>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--gray-500)' }}>Kembangkan deskripsi kursus dengan topik spesifik</p>
                </div>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setTopicsModal(false)}><X size={14}/></button>
            </div>
            
            <div className="modal-body" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label" style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, display: 'block', color: 'var(--gray-700)' }}>
                  Topik Utama atau Kata Kunci (Opsional)
                </label>
                <textarea
                  className="input"
                  rows={4}
                  style={{ 
                    resize: 'vertical', 
                    fontSize: 13, 
                    lineHeight: 1.5, 
                    borderRadius: 8, 
                    borderColor: 'var(--gray-300)',
                    padding: '10px 12px'
                  }}
                  placeholder="Masukkan kata kunci atau topik spesifik (contoh: pemrograman berorientasi objek, class, inheritance, polymorphism, encapsulation)..."
                  value={topicsInput}
                  onChange={e => setTopicsInput(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 8 }}>
                  <Info size={14} color="var(--gray-400)" style={{ flexShrink: 0, marginTop: 1 }}/>
                  <span className="input-hint" style={{ fontSize: 11, color: 'var(--gray-500)', lineHeight: 1.4 }}>
                    Asisten AI akan menyusun kalimat deskripsi akademik yang profesional dengan mengutamakan topik-topik di atas.
                  </span>
                </div>
              </div>
            </div>
            
            <div className="modal-footer" style={{ padding: '12px 20px', background: 'var(--gray-50)', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" style={{ borderRadius: 8 }} onClick={() => setTopicsModal(false)}>Batal</button>
              <button
                className="btn btn-primary btn-sm"
                style={{ borderRadius: 8, gap: 6, background: 'var(--indigo-600)' }}
                onClick={handleAiGenerateDesc}
                disabled={aiGeneratingDesc}
              >
                {aiGeneratingDesc ? (
                  <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }}/>
                ) : (
                  <Bot size={13}/>
                )}
                Rumuskan Deskripsi
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
    </>
  )
}
