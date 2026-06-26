import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, AlertTriangle, ChevronRight, CheckCircle2, RotateCcw, Trophy, Target } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSidebar } from '@/components/layout/AppLayout'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

const MODE_LABEL = { ujian:'Ujian', tryout:'Try Out', quiz:'Quiz' }
const MODE_COLOR = { ujian:'var(--indigo-600)', tryout:'#0891b2', quiz:'#7c3aed' }

export default function UjianDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate    = useNavigate()
  const { setOpen: setSidebarOpen, setExamMode } = useSidebar()
  const [exam,        setExam]        = useState(null)
  const [allAttempts, setAllAttempts] = useState([])
  const [myAnswer,    setMyAnswer]    = useState(null)
  const [answers,     setAnswers]     = useState({})
  const [flagged,     setFlagged]     = useState(new Set())
  const [currentQ,    setCurrentQ]    = useState(0)
  const [timeLeft,    setTimeLeft]    = useState(null)
  const [phase,       setPhase]       = useState('loading')
  // ── Anti-cheat state ───────────────────────────────────────
  const [violations,      setViolations]      = useState(0)
  const [violationBanner, setViolationBanner] = useState(false)
  const [violationModal,  setViolationModal]  = useState(false)
  const timerRef         = useRef(null)
  const violationsRef    = useRef(0)          // ref so event handlers get fresh value
  const lastViolationRef = useRef(0)          // debounce timestamp
  const phaseRef         = useRef('loading')  // ref so event handlers get fresh phase
  const MONITOR_MODES    = ['ujian', 'tryout']
  const MAX_VIOLATIONS   = 3

  useEffect(() => { fetchExam() }, [id])

  async function fetchExam() {
    const [{ data: e }, { data: aList }] = await Promise.all([
      supabase.from('exams').select('*, course:courses(name,code)').eq('id', id).single(),
      supabase.from('exam_answers')
        .select('*').eq('exam_id', id).eq('student_id', user.id)
        .order('attempt_number', { ascending: true }),
    ])
    setExam(e)
    const attempts = aList || []
    setAllAttempts(attempts)
    const latest = attempts[attempts.length - 1] || null
    setMyAnswer(latest)
    if (!latest)                    { setPhase('preview') }
    else if (latest.submitted_at)   { setPhase('submitted'); setAnswers(latest.answers || {}) }
    else                            { setPhase('active'); setAnswers(latest.answers || {}); startTimer(e, latest.started_at) }
  }

  function startTimer(examData, startedAt) {
    if (!examData?.duration_minutes) return
    const endTime = new Date(startedAt).getTime() + examData.duration_minutes * 60000
    function tick() {
      const left = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
      setTimeLeft(left)
      if (left <= 0) { clearInterval(timerRef.current); handleSubmit(true) }
    }
    tick()
    timerRef.current = setInterval(tick, 1000)
  }
  useEffect(() => () => clearInterval(timerRef.current), [])

  // Keep phaseRef in sync
  useEffect(() => { phaseRef.current = phase }, [phase])

  // ── Sidebar hide/restore during active exam ────────────────────
  useEffect(() => {
    if (phase === 'active') {
      setSidebarOpen(false)   // tutup sidebar
      setExamMode(true)       // disable toggle button
    } else {
      setExamMode(false)      // re-enable toggle
      // Tidak restore sidebar — biarkan user kontrol sendiri
    }
    return () => setExamMode(false)  // cleanup saat halaman ditinggal
  }, [phase])

  // ── Focus / integrity monitoring ───────────────────────────
  useEffect(() => {
    if (phase !== 'active') return
    if (!exam || !MONITOR_MODES.includes(exam.exam_mode || 'ujian')) return

    function triggerViolation(reason) {
      if (phaseRef.current !== 'active') return
      // Debounce: ignore if within 2.5s of last violation
      const now = Date.now()
      if (now - lastViolationRef.current < 2500) return
      lastViolationRef.current = now

      violationsRef.current += 1
      const count = violationsRef.current
      setViolations(count)

      if (count >= MAX_VIOLATIONS) {
        // Save violation flag and auto-submit
        setViolationBanner(false)
        setViolationModal(false)
        toast.error('⛔ Ujian dikumpulkan otomatis karena pelanggaran integritas.', { duration: 6000 })
        // handleSubmit is stale here — trigger via custom event
        document.dispatchEvent(new CustomEvent('exam-force-submit', { detail: { vcount: count } }))
      } else if (count === 2) {
        setViolationModal(true)
      } else {
        setViolationBanner(true)
        setTimeout(() => setViolationBanner(false), 6000)
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') triggerViolation('tab_hidden')
    }
    const onBlur = () => triggerViolation('window_blur')
    const onFullscreen = () => {
      if (!document.fullscreenElement) triggerViolation('fullscreen_exit')
    }
    const onForceSubmit = () => handleSubmit(true)

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    document.addEventListener('fullscreenchange', onFullscreen)
    document.addEventListener('exam-force-submit', onForceSubmit)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('fullscreenchange', onFullscreen)
      document.removeEventListener('exam-force-submit', onForceSubmit)
    }
  }, [phase, exam])

  function shuffle(arr) {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  async function buildQuestionsFromBank(exam) {
    const cfg = exam.question_config
    const topicConfigs = Array.isArray(cfg)
      ? cfg
      : [{ topic: null, mudah: cfg?.mudah||0, sedang: cfg?.sedang||0, sulit: cfg?.sulit||0 }]
    const allPicked = []
    const shortages = []   // track kekurangan soal

    for (const tc of topicConfigs) {
      const diffs = ['mudah','sedang','sulit'].filter(d => (tc[d]||0) > 0)
      if (!diffs.length) continue
      let query = supabase.from('questions')
        .select('id,question_text,options,correct_answer,difficulty,explanation')
        .eq('course_id', exam.course_id).in('difficulty', diffs)
      if (tc.topic) query = query.eq('category', tc.topic)
      const { data: qPool } = await query
      const byDiff = { mudah:[], sedang:[], sulit:[] }
      ;(qPool || []).forEach(q => byDiff[q.difficulty]?.push(q))
      for (const d of ['mudah','sedang','sulit']) {
        const need = tc[d] || 0; if (!need) continue
        const available = byDiff[d].length
        if (available < need) {
          shortages.push(`"${tc.topic||'Umum'}" ${d}: butuh ${need}, tersedia ${available}`)
        }
        shuffle(byDiff[d]).slice(0, need).forEach(q => {
          const idxMap = q.options.map((_, i) => i)
          const shuffledIdx = shuffle(idxMap)
          allPicked.push({
            id: q.id, type: 'multiple_choice', text: q.question_text,
            options: shuffledIdx.map(i => q.options[i]),
            answer: String.fromCharCode(65 + shuffledIdx.indexOf(q.correct_answer)),
            difficulty: q.difficulty, topic: tc.topic || null,
            explanation: q.explanation || null,
          })
        })
      }
    }
    if (shortages.length) {
      toast(`⚠️ Soal kurang di bank: ${shortages.join(' | ')}. Menampilkan ${allPicked.length} soal yang tersedia.`, { duration: 6000 })
    }
    return shuffle(allPicked)
  }

  async function handleStart() {
    const mode = exam.exam_mode || 'ujian'
    const maxAtt = exam.max_attempts || 1
    const doneCount = allAttempts.filter(a => a.submitted_at).length

    if (mode === 'tryout' && doneCount >= maxAtt) {
      toast.error(`Batas percobaan (${maxAtt}×) sudah tercapai`); return
    }

    let snapshot = []
    if (exam.use_question_bank) {
      snapshot = await buildQuestionsFromBank(exam)
      if (!snapshot.length) { toast.error('Bank soal kosong atau tidak cukup soal'); return }
    }

    const nextAttempt = allAttempts.length + 1
    const { data, error } = await supabase.from('exam_answers').insert({
      exam_id: id, student_id: user.id, answers: {},
      started_at: new Date().toISOString(),
      questions_snapshot: snapshot,
      attempt_number: nextAttempt,
    }).select().single()
    if (error) { toast.error('Gagal memulai: ' + error.message); return }
    setMyAnswer(data)
    setAllAttempts(prev => [...prev, data])
    setAnswers({})
    // Reset violation counters for new attempt
    violationsRef.current = 0
    lastViolationRef.current = 0
    setViolations(0)
    setViolationBanner(false)
    setViolationModal(false)
    setPhase('active')
    startTimer(exam, data.started_at)
    // Request fullscreen for monitored modes
    if (MONITOR_MODES.includes(mode)) {
      try { await document.documentElement.requestFullscreen() } catch (_) {}
    }
  }

  const handleSubmit = useCallback(async (auto = false) => {
    if (phase !== 'active') return
    clearInterval(timerRef.current)
    if (document.fullscreenElement) { try { await document.exitFullscreen() } catch (_) {} }
    const now = new Date().toISOString()
    const qs = (myAnswer?.questions_snapshot?.length ? myAnswer.questions_snapshot : exam?.questions) || []
    let score = 0, total = 0
    qs.forEach(q => {
      if (q.type === 'multiple_choice') { total++; if (answers[q.id] === q.answer) score += q.points || 1 }
    })
    const finalScore = myAnswer?.questions_snapshot?.length && total > 0
      ? Math.round((score / total) * 100) : score
    // Include violation metadata in answers for teacher review
    const vcount = violationsRef.current
    const savedAnswers = vcount > 0 ? { ...answers, _violations: vcount } : answers
    const { error } = await supabase.from('exam_answers')
      .update({ answers: savedAnswers, score: finalScore, submitted_at: now })
      .eq('id', myAnswer.id)
    if (error) { toast.error('Gagal mengumpulkan ujian'); return }
    const updated = { ...myAnswer, answers: savedAnswers, score: finalScore, submitted_at: now }
    setMyAnswer(updated)
    setAllAttempts(prev => prev.map(a => a.id === myAnswer.id ? updated : a))
    setPhase('submitted')
    if (!auto) toast.success('Berhasil dikumpulkan! 🎉')
    else if (vcount >= MAX_VIOLATIONS) { /* already toasted */ }
    else toast('Waktu habis — dikumpulkan otomatis', { icon: '⏰' })
  }, [phase, exam, myAnswer, answers, id])

  function formatTime(s) {
    if (s === null) return '--:--'
    const m = Math.floor(s / 60), sec = s % 60
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }

  function scoreColor(s) { return s >= 80 ? '#16a34a' : s >= 60 ? '#ca8a04' : '#dc2626' }

  if (phase === 'loading') return <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}><div className="spinner"/></div>
  if (!exam) return <div className="empty-state"><p>Ujian tidak ditemukan.</p></div>

  const mode       = exam.exam_mode || 'ujian'
  const maxAtt     = exam.max_attempts || 1
  const submitted  = allAttempts.filter(a => a.submitted_at)
  const doneCount  = submitted.length
  const questions  = (myAnswer?.questions_snapshot?.length ? myAnswer.questions_snapshot : exam.questions) || []
  const answered   = Object.keys(answers).length
  const typeLabel  = { uts:'Evaluasi', uas:'Evaluasi', kuis:'Kuis' }
  const canRetry   = mode === 'quiz' || (mode === 'tryout' && doneCount < maxAtt) || (mode === 'ujian' && myAnswer?.score !== null && myAnswer?.score !== undefined && myAnswer.score < 70)

  /* ── Submitted view ─────────────────────────────────── */
  if (phase === 'submitted') {
    const isBank     = myAnswer?.questions_snapshot?.length > 0
    const qs         = isBank ? myAnswer.questions_snapshot : (exam.questions || [])
    const mcTotal    = qs.filter(q => q.type === 'multiple_choice').length
    const mcCorrect  = qs.filter(q => q.type === 'multiple_choice' && (myAnswer?.answers||{})[q.id] === q.answer).length
    const finalScore = myAnswer?.score ?? null
    const bestScore  = submitted.length ? Math.max(...submitted.map(a => a.score ?? 0)) : null

    return (
      <div style={{ maxWidth:580, margin:'0 auto' }}>
        <div className="card" style={{ padding:'40px 32px' }}>
          {/* Icon */}
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ width:68, height:68, borderRadius:'50%', background:'linear-gradient(135deg,#d1fae5,#a7f3d0)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <CheckCircle2 size={34} color="#10b981"/>
            </div>
            <h1 style={{ fontSize:20, fontWeight:800, marginBottom:4 }}>
              {mode === 'ujian' ? 'Ujian Dikumpulkan!' : mode === 'tryout' ? `Percobaan ${doneCount} Selesai!` : 'Quiz Selesai!'}
            </h1>
            <p style={{ color:'var(--gray-500)', fontSize:13 }}>{exam.title}</p>
          </div>

          {/* Score for bank soal */}
          {isBank && finalScore !== null && (
            <div style={{ textAlign:'center', background:'linear-gradient(135deg,#eef2ff,#f0fdf4)', border:'1px solid #c7d2fe', borderRadius:12, padding:'18px', marginBottom:20 }}>
              <div style={{ fontSize:40, fontWeight:900, color: scoreColor(finalScore), lineHeight:1 }}>{finalScore}</div>
              <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:4 }}>dari 100 poin</div>
              <div style={{ fontSize:13, color:'var(--gray-600)', marginTop:6 }}>{mcCorrect} / {mcTotal} soal benar</div>
            </div>
          )}

          {/* Ujian/Evaluasi mode: display result status based on passing grade */}
          {mode === 'ujian' && (
            <div style={{ display:'flex', justifyContent:'center', marginBottom:20 }}>
              {finalScore !== null && finalScore < 70 ? (
                <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:20, padding:'8px 18px' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:'#ef4444' }}/>
                  <span style={{ fontSize:13, fontWeight:700, color:'#b91c1c' }}>Nilai kelulusan belum mencapai minimal passing grade (70)</span>
                </div>
              ) : (
                <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:20, padding:'8px 18px' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:'#22c55e' }}/>
                  <span style={{ fontSize:13, fontWeight:700, color:'#15803d' }}>Lulus Kompeten! 🎉</span>
                </div>
              )}
            </div>
          )}

          {/* Attempt history for tryout/quiz/ujian */}
          {(mode === 'tryout' || mode === 'quiz' || mode === 'ujian') && submitted.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--gray-500)', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                <Trophy size={13} color="#f59e0b"/> Riwayat Percobaan
                {bestScore !== null && <span style={{ marginLeft:'auto', color:'var(--indigo-600)', fontWeight:800 }}>Terbaik: {bestScore}</span>}
              </div>
              <div style={{ border:'1px solid var(--gray-200)', borderRadius:10, overflow:'hidden' }}>
                {submitted.map((a, i) => {
                  const isBest = a.score === bestScore
                  const isCurrent = a.id === myAnswer?.id
                  return (
                    <div key={a.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 14px', background: isCurrent ? '#f5f3ff' : '#fff', borderBottom: i < submitted.length-1 ? '1px solid var(--gray-100)' : 'none' }}>
                      <span style={{ fontSize:12, color:'var(--gray-400)', width:80, flexShrink:0 }}>
                        Percobaan {a.attempt_number ?? i+1}
                      </span>
                      <span style={{ fontSize:14, fontWeight:800, color: scoreColor(a.score ?? 0), flex:1 }}>
                        {a.score ?? '—'}
                      </span>
                      <span style={{ fontSize:11, color:'var(--gray-400)' }}>
                        {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}
                      </span>
                      {isBest && <span style={{ fontSize:10, fontWeight:800, background:'#fef9c3', color:'#92400e', padding:'2px 8px', borderRadius:20 }}>Terbaik</span>}
                      {isCurrent && !isBest && <span style={{ fontSize:10, color:'var(--indigo-400)' }}>ini</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Try out progress */}
          {mode === 'tryout' && (
            <div style={{ fontSize:12, color:'var(--gray-400)', textAlign:'center', marginBottom:16 }}>
              {doneCount} / {maxAtt} percobaan terpakai
            </div>
          )}

          {/* Buttons */}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {canRetry && (
              <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}
                onClick={() => { setPhase('preview') }}>
                <RotateCcw size={14}/>
                {mode === 'quiz' ? 'Mulai Lagi' : mode === 'ujian' ? 'Ulang Evaluasi' : `Coba Lagi (${maxAtt - doneCount} tersisa)`}
              </button>
            )}
            <button className="btn btn-secondary" style={{ width:'100%', justifyContent:'center' }} onClick={() => navigate(-1)}>
              <ArrowLeft size={14}/> Kembali ke Daftar Ujian
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Preview view ───────────────────────────────────── */
  if (phase === 'preview') {
    const totalSoal = exam.use_question_bank && exam.question_config
      ? (Array.isArray(exam.question_config)
          ? exam.question_config.reduce((s,r) => s+(r.mudah||0)+(r.sedang||0)+(r.sulit||0), 0)
          : (exam.question_config.mudah||0)+(exam.question_config.sedang||0)+(exam.question_config.sulit||0))
      : questions.length
    const blockedTryout = mode === 'tryout' && doneCount >= maxAtt
    const isMonitored = MONITOR_MODES.includes(mode)
    return (
      <div style={{ maxWidth:580, margin:'0 auto' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom:16 }}>
          <ArrowLeft size={14}/> Kembali
        </button>
        <div className="card">
          <div style={{ textAlign:'center', padding:'36px 32px 24px' }}>
            <span style={{ fontSize:11, fontWeight:800, background: MODE_COLOR[mode]+'22', color: MODE_COLOR[mode], padding:'4px 14px', borderRadius:20, marginBottom:12, display:'inline-block' }}>
              {MODE_LABEL[mode]}
            </span>
            <span className="badge-pill badge-indigo" style={{ marginLeft:8 }}>{typeLabel[exam.type]||exam.type}</span>
            <h1 style={{ fontSize:20, fontWeight:800, margin:'12px 0 4px' }}>{exam.title}</h1>
            <p style={{ fontSize:12, color:'var(--gray-400)', marginBottom:24 }}>{exam.course?.code} · {exam.course?.name}</p>
            <div style={{ display:'flex', justifyContent:'center', gap:32, marginBottom:28, fontSize:13 }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:24, fontWeight:800, color:'var(--indigo-600)' }}>{totalSoal}</div>
                <div style={{ color:'var(--gray-400)' }}>Soal</div>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:24, fontWeight:800, color:'var(--indigo-600)' }}>{exam.duration_minutes}</div>
                <div style={{ color:'var(--gray-400)' }}>Menit</div>
              </div>
              {mode !== 'ujian' && (
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:24, fontWeight:800, color: MODE_COLOR[mode] }}>
                    {mode === 'quiz' ? '∞' : `${doneCount}/${maxAtt}`}
                  </div>
                  <div style={{ color:'var(--gray-400)' }}>Percobaan</div>
                </div>
              )}
            </div>
          </div>

          {/* \u2500\u2500 TryOut: simulasi ujian info \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
          {mode === 'tryout' && !blockedTryout && (
            <div style={{ margin:'0 24px 12px', background:'linear-gradient(135deg,#ecfeff,#f0f9ff)', border:'2px solid #67e8f9', borderRadius:14, padding:'16px 18px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <Target size={16} color="#0891b2"/>
                <span style={{ fontSize:13, fontWeight:800, color:'#0e7490', letterSpacing:.3 }}>Try Out — Simulasi Ujian Nyata</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, fontSize:12, color:'#164e63' }}>
                {[
                  '🎯 Try Out dirancang untuk mensimulasikan suasana ujian sesungguhnya',
                  '🔀 Soal dan pilihan jawaban diacak setiap percobaan agar Anda terbiasa',
                  '📊 Hasil setiap percobaan tersimpan — pantau perkembangan nilai Anda',
                  `🔁 Anda memiliki ${maxAtt} percobaan total, gunakan sebaik mungkin`,
                  '🛡️ Sistem pengawasan aktif seperti ujian asli (detail di bawah)',
                ].map((t, i) => (
                  <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* \u2500\u2500 Integrity rules section \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}

          {isMonitored && !blockedTryout && (
            <div style={{ margin:'0 24px 20px', background:'linear-gradient(135deg,#1e1b4b,#312e81)', borderRadius:14, padding:'18px 20px', color:'#fff' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                <span style={{ fontSize:18 }}>🛡️</span>
                <span style={{ fontSize:13, fontWeight:800, letterSpacing:.3 }}>Mode Pengawasan Aktif</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, fontSize:12, color:'rgba(255,255,255,.85)' }}>
                {[
                  { icon:'🖥️', text:'Layar akan masuk ke mode Fullscreen saat ujian dimulai' },
                  { icon:'👁️', text:'Perpindahan tab atau aplikasi lain akan terdeteksi' },
                  { icon:'⚠️', text:'Peringatan 1: Banner merah muncul jika Anda berpindah tab' },
                  { icon:'🚨', text:'Peringatan 2: Modal konfirmasi — satu langkah lagi dari pengumpulan otomatis' },
                  { icon:'⛔', text:`Pelanggaran ke-${MAX_VIOLATIONS}: Ujian dikumpulkan otomatis & dicatat` },
                  { icon:'📋', text:'Jumlah pelanggaran disimpan dan dapat dilihat dosen' },
                ].map((r, i) => (
                  <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                    <span style={{ flexShrink:0 }}>{r.icon}</span>
                    <span>{r.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quiz: no monitoring note */}
          {mode === 'quiz' && (
            <div style={{ margin:'0 24px 20px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12, padding:'12px 16px', fontSize:12, color:'#166534' }}>
              ⚡ Mode Quiz tidak diawasi — kerjakan dengan santai!
            </div>
          )}

          <div style={{ padding:'0 24px 24px' }}>
            {blockedTryout ? (
              <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'12px', fontSize:13, color:'#dc2626', marginBottom:20 }}>
                Batas percobaan ({maxAtt}×) sudah tercapai.
              </div>
            ) : (
              <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8, padding:'12px 14px', fontSize:12, color:'#92400e', marginBottom:16, textAlign:'left' }}>
                <AlertTriangle size={13} style={{ display:'inline', marginRight:6 }}/>
                Setelah memulai, timer akan berjalan. Pastikan koneksi internet stabil.
                {mode !== 'ujian' && ' Soal akan diacak ulang tiap percobaan.'}
              </div>
            )}
            {!blockedTryout && (
              <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }} onClick={handleStart}>
                {doneCount > 0 ? <RotateCcw size={14}/> : <ChevronRight size={14}/>}
                {doneCount > 0 ? (mode==='quiz' ? 'Mulai Lagi' : `Coba Lagi (${maxAtt-doneCount} tersisa)`) : (isMonitored ? '🛡️ Mulai & Aktifkan Fullscreen' : 'Mulai')}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* Active exam view */
  const attemptNum    = myAnswer?.attempt_number || allAttempts.length
  const q             = questions[currentQ]
  const isFlagged     = q && flagged.has(q.id)
  const answeredCount = questions.filter(x => answers[x.id] && !flagged.has(x.id)).length
  const flaggedCount  = questions.filter(x => flagged.has(x.id)).length

  function toggleFlag(qid) {
    setFlagged(prev => { const s = new Set(prev); s.has(qid) ? s.delete(qid) : s.add(qid); return s })
  }

  const STATUS_STYLE = {
    answered:   { bg:'#16a34a', color:'#fff', border:'#16a34a' },
    flagged:    { bg:'#f97316', color:'#fff', border:'#f97316' },
    unanswered: { bg:'#fff',    color:'#dc2626', border:'#fca5a5' },
  }
  function qStatus(question) {
    if (flagged.has(question.id)) return 'flagged'   // flagged takes priority
    if (answers[question.id]) return 'answered'
    return 'unanswered'
  }

  // Mode-specific theme
  const modeTheme = {
    ujian:   { grad:'linear-gradient(135deg,#4f46e5,#7c3aed)', light:'#eef2ff', accent:'#4f46e5', emoji:'📝' },
    tryout:  { grad:'linear-gradient(135deg,#0891b2,#0e7490)', light:'#ecfeff', accent:'#0891b2', emoji:'🎯' },
    quiz:    { grad:'linear-gradient(135deg,#7c3aed,#a855f7)', light:'#faf5ff', accent:'#7c3aed', emoji:'⚡' },
  }
  const theme = modeTheme[mode] || modeTheme.ujian
  const isLowTime = timeLeft !== null && timeLeft < 300
  const pct = questions.length > 0 ? Math.round(answeredCount / questions.length * 100) : 0

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 56px)', overflow:'hidden', background:'#f8fafc' }}>

      {/* ── Violation Banner (peringatan 1) ───────────────────── */}
      {violationBanner && (
        <div style={{
          position:'fixed', top:0, left:0, right:0, zIndex:9999,
          background:'linear-gradient(90deg,#dc2626,#b91c1c)',
          color:'#fff', padding:'12px 24px',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          boxShadow:'0 4px 20px rgba(220,38,38,.5)',
          animation:'slideUp .2s ease',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:20 }}>⚠️</span>
            <div>
              <div style={{ fontSize:14, fontWeight:800 }}>Peringatan {violations}/{MAX_VIOLATIONS} — Jangan tinggalkan halaman ujian!</div>
              <div style={{ fontSize:12, opacity:.9 }}>Perpindahan tab/aplikasi terdeteksi. {MAX_VIOLATIONS - violations} pelanggaran lagi = dikumpulkan otomatis.</div>
            </div>
          </div>
          <button onClick={() => setViolationBanner(false)}
            style={{ background:'rgba(255,255,255,.2)', border:'none', color:'#fff', borderRadius:8, padding:'4px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
            ✕ Tutup
          </button>
        </div>
      )}

      {/* ── Violation Modal (peringatan 2) ─────────────────────── */}
      {violationModal && (
        <div style={{
          position:'fixed', inset:0, zIndex:10000,
          background:'rgba(0,0,0,.7)', backdropFilter:'blur(4px)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <div style={{
            background:'#fff', borderRadius:20, padding:'36px 32px', maxWidth:420, width:'90%',
            textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,.4)',
            animation:'scaleIn .2s ease',
          }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🚨</div>
            <h2 style={{ fontSize:20, fontWeight:900, color:'#dc2626', marginBottom:8 }}>Peringatan Ke-2!</h2>
            <p style={{ fontSize:13, color:'var(--gray-600)', lineHeight:1.7, marginBottom:20 }}>
              Anda terdeteksi meninggalkan halaman ujian <strong>2 kali</strong>.<br/>
              <strong style={{ color:'#dc2626' }}>Satu pelanggaran lagi</strong> akan mengakibatkan ujian dikumpulkan secara otomatis dan pelanggaran dicatat.
            </p>
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#7f1d1d', marginBottom:20, textAlign:'left' }}>
              💡 Tetap di halaman ini, jangan ganti tab atau minimasi jendela browser.
            </div>
            <button
              onClick={() => setViolationModal(false)}
              style={{ background:'linear-gradient(135deg,#dc2626,#b91c1c)', color:'#fff', border:'none',
                borderRadius:12, padding:'12px 32px', fontSize:14, fontWeight:800, cursor:'pointer',
                width:'100%', boxShadow:'0 4px 16px rgba(220,38,38,.4)' }}
            >
              Saya Mengerti — Kembali ke Ujian
            </button>
          </div>
        </div>
      )}

      {/* ── Top bar ───────────────────────────────────────────── */}
      <div style={{
        flexShrink:0, background: theme.grad,
        padding:'0 20px', display:'flex', alignItems:'center',
        justifyContent:'space-between', zIndex:10,
        boxShadow:'0 4px 20px rgba(0,0,0,.18)', minHeight:58,
      }}>
        {/* Left: title + progress */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, fontWeight:800, background:'rgba(255,255,255,.2)', color:'#fff', padding:'2px 10px', borderRadius:20, letterSpacing:.5 }}>
              {theme.emoji} {MODE_LABEL[mode]}
              {mode !== 'ujian' && ` · #${attemptNum}`}
            </span>
            <span style={{ fontSize:14, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{exam.title}</span>
          </div>
          {/* Progress bar */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:6 }}>
            <div style={{ flex:1, maxWidth:220, height:5, background:'rgba(255,255,255,.25)', borderRadius:99, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background:'#fff', borderRadius:99, transition:'width .4s' }}/>
            </div>
            <span style={{ fontSize:11, color:'rgba(255,255,255,.9)', fontWeight:600, flexShrink:0 }}>
              {answeredCount}/{questions.length} dijawab
            </span>
            {flaggedCount > 0 && (
              <span style={{ fontSize:11, color:'#fde68a', fontWeight:700, flexShrink:0 }}>🚩 {flaggedCount}</span>
            )}
          </div>
        </div>

        {/* Timer + Submit */}
        <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{
            display:'flex', alignItems:'center', gap:8,
            background: isLowTime ? '#dc2626' : 'rgba(255,255,255,.18)',
            border: `2px solid ${isLowTime ? '#fca5a5' : 'rgba(255,255,255,.3)'}`,
            borderRadius:14, padding:'7px 14px',
            animation: isLowTime ? 'timer-pulse 1s infinite' : 'none',
            transition:'all .3s',
          }}>
            <Clock size={15} color={isLowTime ? '#fecaca' : '#fff'}/>
            <span style={{ fontSize:18, fontWeight:900, fontVariantNumeric:'tabular-nums', color:'#fff', letterSpacing:1 }}>
              {formatTime(timeLeft)}
            </span>
          </div>
          <button
            onClick={() => handleSubmit(false)}
            style={{ background:'#fff', color: theme.accent, border:'none', borderRadius:12,
              padding:'9px 20px', fontSize:13, fontWeight:800, cursor:'pointer',
              boxShadow:'0 2px 12px rgba(0,0,0,.15)', transition:'transform .12s, box-shadow .12s' }}
            onMouseEnter={e => { e.currentTarget.style.transform='scale(1.04)'; e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,.2)' }}
            onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; e.currentTarget.style.boxShadow='0 2px 12px rgba(0,0,0,.15)' }}
          >
            Kumpulkan ✓
          </button>
        </div>
      </div>

      {/* ── Body: sidebar + question ──────────────────────────── */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Left sidebar */}
        <div style={{ width:200, flexShrink:0, background:'#1e1b4b', display:'flex', flexDirection:'column', overflowY:'auto' }}>
          {/* Sidebar header */}
          <div style={{ padding:'14px 14px 10px' }}>
            <div style={{ fontSize:10, fontWeight:800, color:'rgba(255,255,255,.45)', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:8 }}>Navigasi Soal</div>
            {/* Mini stats */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4, marginBottom:12 }}>
              {[
                { label:'Dijawab', val:answeredCount, color:'#4ade80' },
                { label:'Ragu', val:flaggedCount, color:'#fb923c' },
                { label:'Belum', val:questions.length - answeredCount - flaggedCount, color:'#f87171' },
              ].map(s => (
                <div key={s.label} style={{ textAlign:'center', background:'rgba(255,255,255,.07)', borderRadius:8, padding:'6px 4px' }}>
                  <div style={{ fontSize:16, fontWeight:900, color:s.color }}>{s.val}</div>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,.4)', fontWeight:600 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* Progress bar */}
            <div style={{ height:4, background:'rgba(255,255,255,.1)', borderRadius:99, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background: theme.grad, borderRadius:99, transition:'width .4s' }}/>
            </div>
          </div>

          {/* Grid buttons */}
          <div style={{ padding:'0 10px 10px', display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:5 }}>
            {questions.map((question, i) => {
              const st = qStatus(question)
              const isActive = i === currentQ
              const bgMap = { answered:'#16a34a', flagged:'#f97316', unanswered:'rgba(255,255,255,.08)' }
              const colorMap = { answered:'#fff', flagged:'#fff', unanswered:'rgba(255,255,255,.45)' }
              const borderMap = { answered:'#16a34a', flagged:'#f97316', unanswered:'rgba(255,255,255,.15)' }
              return (
                <button key={question.id} className="exam-q-nav-btn"
                  onClick={() => setCurrentQ(i)} title={`Soal ${i+1}`}
                  style={{
                    background: isActive ? '#fff' : bgMap[st],
                    color: isActive ? theme.accent : colorMap[st],
                    borderColor: isActive ? '#fff' : borderMap[st],
                    boxShadow: isActive ? `0 0 0 3px ${theme.accent}60` : 'none',
                  }}
                >{i+1}</button>
              )
            })}
          </div>

          {/* Legend */}
          <div style={{ padding:'12px 14px', marginTop:'auto', borderTop:'1px solid rgba(255,255,255,.08)' }}>
            {[
              { color:'#4ade80', label:'Dijawab' },
              { color:'#fb923c', label:'Ragu-ragu' },
              { color:'rgba(255,255,255,.3)', label:'Belum' },
            ].map(l => (
              <div key={l.label} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
                <div style={{ width:10, height:10, borderRadius:3, background:l.color, flexShrink:0 }}/>
                <span style={{ fontSize:11, color:'rgba(255,255,255,.55)', fontWeight:600 }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Main question area ─────────────────────────────── */}
        <div style={{ flex:1, overflowY:'auto', padding:'32px 36px' }}>
          {q ? (
            <div style={{ maxWidth:680, margin:'0 auto' }}>

              {/* Question header */}
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                {/* Big number badge */}
                <div style={{
                  width:48, height:48, borderRadius:14, background: theme.grad,
                  color:'#fff', display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:18, fontWeight:900, flexShrink:0,
                  boxShadow:`0 4px 12px ${theme.accent}40`,
                }}>{currentQ+1}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:'var(--gray-400)', fontWeight:700, textTransform:'uppercase', letterSpacing:.5 }}>
                    Soal {currentQ+1} dari {questions.length}
                    {q.difficulty && (
                      <span style={{ marginLeft:8, color: q.difficulty==='mudah'?'#16a34a':q.difficulty==='sulit'?'#dc2626':'#ca8a04',
                        background: q.difficulty==='mudah'?'#dcfce7':q.difficulty==='sulit'?'#fee2e2':'#fef9c3',
                        padding:'1px 8px', borderRadius:20, fontSize:10 }}>
                        {q.difficulty}
                      </span>
                    )}
                  </div>
                  <div style={{ height:3, marginTop:5, background:'var(--gray-100)', borderRadius:99, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${((currentQ+1)/questions.length)*100}%`, background: theme.grad, borderRadius:99, transition:'width .3s' }}/>
                  </div>
                </div>
                <button onClick={() => toggleFlag(q.id)}
                  style={{
                    display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:10,
                    border:`2px solid ${isFlagged ? '#f97316' : 'var(--gray-200)'}`,
                    background: isFlagged ? '#fff7ed' : '#fff',
                    color: isFlagged ? '#f97316' : 'var(--gray-400)',
                    fontSize:12, fontWeight:700, cursor:'pointer', transition:'all .15s',
                    boxShadow: isFlagged ? '0 2px 8px rgba(249,115,22,.2)' : 'none',
                  }}>
                  🚩 {isFlagged ? 'Ditandai' : 'Ragu-ragu'}
                </button>
              </div>

              {/* Question text card */}
              <div style={{
                background:'#fff', borderRadius:16, padding:'22px 26px', marginBottom:22,
                border:'1px solid var(--gray-200)',
                borderLeft:`4px solid ${theme.accent}`,
                boxShadow:'0 2px 16px rgba(0,0,0,.06)',
                fontSize:14.5, color:'var(--gray-900)', lineHeight:1.9, fontWeight:500,
              }}>
                {q.text}
              </div>

              {/* Options */}
              {q.type === 'multiple_choice' && (
                <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:32 }}>
                  {q.options?.map((opt, oi) => {
                    const letter = String.fromCharCode(65 + oi)
                    const selected = answers[q.id] === letter
                    const optColors = ['#6366f1','#0891b2','#7c3aed','#059669','#dc2626']
                    const optColor  = optColors[oi] || '#6366f1'
                    return (
                      <label key={letter}
                        className={`exam-option${selected ? ' selected' : ''}`}
                        style={{ animationDelay:`${oi * 0.04}s` }}
                      >
                        <input type="radio" name={q.id} value={letter} checked={selected}
                          onChange={() => setAnswers(prev => ({ ...prev, [q.id]: letter }))}
                          style={{ display:'none' }}/>
                        <div className="opt-letter"
                          style={selected ? {} : { borderColor: optColor+'40', color: optColor, background: optColor+'0d' }}
                        >{letter}</div>
                        <span style={{ color: selected ? '#3730a3' : 'var(--gray-700)', fontWeight: selected ? 700 : 400, flex:1 }}>{opt}</span>
                        {selected && <span style={{ fontSize:16, flexShrink:0 }}>✓</span>}
                      </label>
                    )
                  })}
                </div>
              )}
              {q.type === 'essay' && (
                <textarea className="input" placeholder="Tulis jawaban Anda..." rows={6}
                  value={answers[q.id] || ''}
                  onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                  style={{ resize:'vertical', fontFamily:'inherit', fontSize:13, marginBottom:32, borderRadius:12 }}/>
              )}

              {/* Navigation */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                <button
                  onClick={() => setCurrentQ(i => Math.max(0, i-1))} disabled={currentQ === 0}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', borderRadius:12,
                    border:'2px solid var(--gray-200)', background:'#fff', color:'var(--gray-600)',
                    fontSize:13, fontWeight:700, cursor: currentQ===0 ? 'not-allowed' : 'pointer',
                    opacity: currentQ===0 ? .4 : 1, transition:'all .15s' }}
                >
                  ← Sebelumnya
                </button>
                <span style={{ fontSize:12, color:'var(--gray-400)', fontWeight:600 }}>{currentQ+1} / {questions.length}</span>
                {currentQ < questions.length - 1
                  ? <button
                      onClick={() => setCurrentQ(i => i+1)}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', borderRadius:12,
                        border:'none', background: theme.grad, color:'#fff',
                        fontSize:13, fontWeight:800, cursor:'pointer',
                        boxShadow:`0 4px 12px ${theme.accent}40`, transition:'all .15s' }}
                    >
                      Selanjutnya →
                    </button>
                  : <button
                      onClick={() => handleSubmit(false)}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 24px', borderRadius:12,
                        border:'none', background:'linear-gradient(135deg,#16a34a,#059669)', color:'#fff',
                        fontSize:13, fontWeight:800, cursor:'pointer',
                        boxShadow:'0 4px 12px rgba(22,163,74,.4)' }}
                    >
                      Kumpulkan ✓
                    </button>
                }
              </div>

            </div>
          ) : (
            <div style={{ textAlign:'center', paddingTop:80, color:'var(--gray-400)' }}>Tidak ada soal.</div>
          )}
        </div>
      </div>
    </div>
  )
}


