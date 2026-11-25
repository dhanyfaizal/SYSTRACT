// Modal soal UTS/UAS (pertemuan 8 & 16): AI menyusun 25 soal pilihan ganda, instruktur
// meninjau, menyalin, atau menyimpannya sebagai ujian kursus.
import { useState } from 'react'
import { X, Loader2, Bot, Copy, RefreshCw, Check, HelpCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { generateMcqQuestions, PROGRES_MENUNGGU } from '@/lib/ai'

/**
 * @param {object}   course    kursus terpilih
 * @param {object}   meeting   materi pertemuan 8 atau 16
 * @param {Function} onSaved   setelah ujian tersimpan
 */
export default function ModalSoalUjian({ course, meeting, onClose, onSaved }) {
  const { user } = useAuth()
  const selectedCourse = course
  const activeMeeting = meeting
  const [mcqData, setMcqData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progres, setProgres] = useState('')

  async function handleGenerateMcqQuestions() {
    setLoading(true)
    setProgres("Menghubungi Gateway API Server...")

    let subTimer = null
    const steps = [
      "Menganalisis Cakupan Materi Pembelajaran...",
      "Merancang 25 Soal Pilihan Ganda (MCQ)...",
      "Menyusun Kunci Jawaban & Penjelasan...",
      "Menyeimbangkan Opsi Distractor Jawaban...",
      "Mempersiapkan Output Draft Soal..."
    ]
    let currentStep = 0

    const handleProgress = (event) => {
      if (typeof event === 'string') {
        if (event === PROGRES_MENUNGGU) {
          setProgres(steps[0])
          subTimer = setInterval(() => {
            currentStep++
            if (currentStep < steps.length) {
              setProgres(steps[currentStep])
            } else {
              setProgres("AI sedang merumuskan soal...")
            }
          }, 2500)
        } else {
          if (subTimer) clearInterval(subTimer)
          setProgres(event)
        }
      } else if (event && event.type === 'chunk') {
        if (subTimer) clearInterval(subTimer)
        const matches = event.text.match(/"id"\s*:\s*"q_(\d+)"/g)
        let currentQuestion = 1
        if (matches && matches.length > 0) {
          const lastMatch = matches[matches.length - 1]
          const numMatch = lastMatch.match(/\d+/)
          if (numMatch) currentQuestion = parseInt(numMatch[0])
        }
        setProgres(`AI sedang merumuskan Soal Pilihan Ganda ${currentQuestion}/25... (${event.text.length.toLocaleString('id-ID')} karakter)`)
      }
    }

    try {
      const examType = activeMeeting.week_number === 8 ? 'UTS' : 'UAS'
      const result = await generateMcqQuestions(
        selectedCourse.name,
        examType,
        activeMeeting.title,
        activeMeeting.description,
        handleProgress
      )
      setMcqData(result)
      toast.success("Soal Ujian Pilihan Ganda berhasil disusun AI! 📝")
    } catch (err) {
      toast.error("Gagal generate soal: " + err.message)
    } finally {
      if (subTimer) clearInterval(subTimer)
      setLoading(false)
      setProgres('')
    }
  }

  function handleCopyMcqQuestions() {
    if (!mcqData) return
    let text = `=== ${mcqData.title} ===\n\n`
    mcqData.questions?.forEach((q, idx) => {
      text += `Soal ${idx + 1}\n`
      text += `Pertanyaan:\n${q.text}\n`
      q.options?.forEach((opt, oi) => {
        text += `  ${String.fromCharCode(65 + oi)}. ${opt}\n`
      })
      text += `Kunci Jawaban: ${q.answer}\n`
      text += `Penjelasan: ${q.explanation || '—'}\n\n`
    })
    navigator.clipboard.writeText(text)
    toast.success('Soal pilihan ganda berhasil disalin ke clipboard!')
  }

  async function handleSaveMcqExam() {
    if (!mcqData) return
    setSaving(true)
    try {
      const rawType = activeMeeting.week_number === 8 ? 'uts' : 'uas'
      
      // Check if there is already an exam of this type for this course
      const { data: existingExams } = await supabase
        .from('exams')
        .select('id')
        .eq('course_id', course.id)
        .eq('type', rawType)
      
      if (existingExams && existingExams.length > 0) {
        // Update the existing exam
        const examId = existingExams[0].id
        const { error } = await supabase
          .from('exams')
          .update({
            title: `Evaluasi ${rawType.toUpperCase()}`,
            questions: mcqData.questions,
            duration_minutes: 90,
            is_published: true
          })
          .eq('id', examId)
        if (error) throw error
      } else {
        // Insert a new exam
        const { error } = await supabase
          .from('exams')
          .insert({
            course_id: course.id,
            title: `Evaluasi ${rawType.toUpperCase()}`,
            type: rawType,
            questions: mcqData.questions,
            duration_minutes: 90,
            is_published: true,
            created_by: user.id
          })
        if (error) throw error
      }
      
      toast.success('Soal Evaluasi berhasil disimpan ke database!')
      onSaved?.()
    } catch (err) {
      toast.error('Gagal menyimpan evaluasi ke database: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 800, maxHeight: '85vh', overflow: 'auto' }}>
        <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bot size={16} color="var(--indigo-600)" />
            <span className="modal-title">
              {+activeMeeting.week_number === 8 || +activeMeeting.week_number === 16 ? 'AI MCQ Questions Generator' : 'AI Slide & WebSlide Generator'}
            </span>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Tutup"><X size={14}/></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Meeting Info */}
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--gray-200)' }}>
            <div style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase' }}>Topik {activeMeeting.week_number}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginTop: 2 }}>{activeMeeting.title}</div>
            {activeMeeting.description && <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>{activeMeeting.description}</div>}
          </div>

          {/* Progress feedback */}
          {progres && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#eef2ff', border: '1px solid #c7d2fe', padding: 12, borderRadius: 8, color: 'var(--indigo-700)', fontSize: 12, fontWeight: 600 }}>
              <Loader2 size={14} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
              <span>{progres}</span>
            </div>
          )}

          {/* ── FLOW FOR UTS/UAS: MCQ Questions ── */}
          {(+activeMeeting.week_number === 8 || +activeMeeting.week_number === 16) ? (
            <div>
              {!mcqData && !loading && (
                <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                  <HelpCircle size={40} color="var(--indigo-300)" style={{ marginBottom: 12 }} />
                  <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>Belum ada soal pilihan ganda yang dirumuskan AI untuk evaluasi ini.</p>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 12, gap: 6 }} onClick={handleGenerateMcqQuestions}>
                    <Bot size={13} /> Susun Soal Evaluasi (Pilihan Ganda)
                  </button>
                </div>
              )}

              {mcqData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Draf Soal Evaluasi AI (25 Soal MCQ):</span>
                    <button className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: 11, gap: 4 }} onClick={handleCopyMcqQuestions}>
                      <Copy size={12}/> Salin Soal
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#fafafa', border: '1px solid var(--gray-200)', borderRadius: 8, padding: 12, maxHeight: 300, overflowY: 'auto' }}>
                    <h4 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 8px 0', color: 'var(--gray-800)' }}>{mcqData.title}</h4>
                    {mcqData.questions?.map((q, idx) => (
                      <div key={idx} style={{ borderBottom: idx < mcqData.questions.length - 1 ? '1px solid var(--gray-200)' : 'none', paddingBottom: idx < mcqData.questions.length - 1 ? 10 : 0, paddingTop: idx > 0 ? 8 : 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--indigo-700)' }}>Soal {idx + 1}</div>
                        <div style={{ fontSize: 12, color: 'var(--gray-800)', marginTop: 4, fontWeight: 600 }}>{q.text}</div>
                        <div style={{ paddingLeft: 12, marginTop: 4 }}>
                          {q.options?.map((opt, oi) => (
                            <div key={oi} style={{ fontSize: 11, color: 'var(--gray-600)' }}>
                              {String.fromCharCode(65 + oi)}. {opt}
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: '#059669', marginTop: 4, background: '#ecfdf5', padding: 6, borderRadius: 4 }}>
                          <strong>Kunci Jawaban: {q.answer}</strong>. {q.explanation}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button className="btn btn-secondary btn-sm" style={{ gap: 4 }} onClick={handleGenerateMcqQuestions} disabled={loading}>
                      <RefreshCw size={12}/> Generate Ulang Soal
                    </button>
                    <button className="btn btn-primary btn-sm" style={{ gap: 4, background: 'var(--success)', borderColor: '#059669' }} onClick={handleSaveMcqExam} disabled={saving}>
                      {saving ? <Loader2 size={13} className="spinner" style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13}/>}
                      Simpan Evaluasi ke Database
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="modal-footer" style={{ position: 'sticky', bottom: 0, background: 'var(--surface)', zIndex: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  )
}
