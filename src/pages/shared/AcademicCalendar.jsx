import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Calendar, Clock, BookOpen, ClipboardList, FileText, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Sk from '@/components/ui/Skeleton'

// Event type config
const TYPE = {
  tugas:     { label:'Tugas',     color:'#f59e0b', bg:'#fef3c7', icon: ClipboardList },
  ujian:     { label:'Ujian',     color:'#ef4444', bg:'#fee2e2', icon: FileText },
  pertemuan: { label:'Pertemuan', color:'#6366f1', bg:'#eef2ff', icon: CheckCircle2 },
}

function isSameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function daysInMonth(d)  { return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate() }

const DAYS = ['Min','Sen','Sel','Rab','Kam','Jum','Sab']
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

export default function AcademicCalendar() {
  const { user, role } = useAuth()
  const [today]   = useState(new Date())
  const [current, setCurrent] = useState(new Date())
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [selDay,  setSelDay]  = useState(null)
  const [courses, setCourses] = useState([])
  const [filterCourse, setFilterCourse] = useState('all')

  useEffect(() => { fetchEvents() }, [user, role])

  async function fetchEvents() {
    setLoading(true)
    let courseIds = []

    if (role === 'mahasiswa') {
      const { data } = await supabase.from('enrollments').select('course_id,course:courses(id,name,code)').eq('student_id', user.id)
      courseIds = (data||[]).map(e => e.course_id)
      setCourses((data||[]).map(e => e.course).filter(Boolean))
    } else if (role === 'dosen') {
      const { data } = await supabase.from('courses').select('id,name,code').eq('dosen_id', user.id).eq('is_active', true)
      courseIds = (data||[]).map(c => c.id)
      setCourses(data||[])
    }

    if (!courseIds.length) { setLoading(false); return }

    // exams_peserta & sesi_presensi_peserta: view tanpa kunci jawaban / kode presensi.
    // View tidak bisa di-embed ke courses, jadi nama kursus diambil dari courseMap.
    const [{ data: assignments }, { data: examRows }, { data: sessionRows }, { data: courseRows }] = await Promise.all([
      supabase.from('assignments').select('id,title,due_date,course_id,course:courses(name,code)')
        .in('course_id', courseIds).not('due_date','is',null),
      supabase.from('exams_peserta').select('id,title,start_at,end_at,course_id')
        .in('course_id', courseIds).not('start_at','is',null),
      supabase.from('sesi_presensi_peserta').select('id,title,meeting_number,created_at,course_id')
        .in('course_id', courseIds),
      supabase.from('courses').select('id,name,code').in('id', courseIds),
    ])
    const courseMap = Object.fromEntries((courseRows || []).map(c => [c.id, c]))
    const exams    = (examRows || []).map(e => ({ ...e, start_time: e.start_at, course: courseMap[e.course_id] }))
    const sessions = (sessionRows || []).map(s => ({ ...s, course: courseMap[s.course_id] }))

    const ev = [
      ...(assignments||[]).map(a => ({
        id:`t-${a.id}`, type:'tugas', title:a.title,
        date: new Date(a.due_date), course_id: a.course_id,
        courseName: a.course?.name, courseCode: a.course?.code,
        detail: `Deadline: ${new Date(a.due_date).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}`,
      })),
      ...(exams||[]).map(e => ({
        id:`u-${e.id}`, type:'ujian', title:e.title,
        date: new Date(e.start_time), course_id: e.course_id,
        courseName: e.course?.name, courseCode: e.course?.code,
        detail: `Mulai: ${new Date(e.start_time).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}`,
      })),
      ...(sessions||[]).map(s => ({
        id:`p-${s.id}`, type:'pertemuan', title:`P${s.meeting_number} – ${s.title}`,
        date: new Date(s.created_at), course_id: s.course_id,
        courseName: s.course?.name, courseCode: s.course?.code,
        detail: new Date(s.created_at).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}),
      })),
    ].filter(e => !isNaN(e.date))
    .sort((a,b) => a.date - b.date)

    setEvents(ev)
    setLoading(false)
  }

  const filtered = useMemo(() =>
    filterCourse === 'all' ? events : events.filter(e => e.course_id === filterCourse)
  , [events, filterCourse])

  // Calendar grid
  const firstDay = startOfMonth(current).getDay()
  const totalDays = daysInMonth(current)
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(current.getFullYear(), current.getMonth(), d))

  function eventsOn(day) {
    if (!day) return []
    return filtered.filter(e => isSameDay(e.date, day))
  }

  const selEvents = selDay ? eventsOn(selDay) : []

  // Upcoming: next 30 days from today
  const upcoming = filtered.filter(e => {
    const diff = e.date - today
    return diff >= -86400000 && diff <= 30 * 86400000
  }).slice(0, 12)

  const prevMonth = () => setCurrent(d => new Date(d.getFullYear(), d.getMonth()-1, 1))
  const nextMonth = () => setCurrent(d => new Date(d.getFullYear(), d.getMonth()+1, 1))

  return (
    <div>
      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Calendar size={20} color="var(--indigo-600)"/> Kalender Akademik
          </h1>
          <p className="page-subtitle">Semua jadwal tugas, ujian, dan pertemuan</p>
        </div>
        <select className="input" style={{ maxWidth:240 }} value={filterCourse} onChange={e=>setFilterCourse(e.target.value)}>
          <option value="all">Semua Mata Kuliah</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
        </select>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:20, alignItems:'start' }}>

        {/* Calendar */}
        <div className="card">
          {/* Month nav */}
          <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--gray-100)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={prevMonth}><ChevronLeft size={16}/></button>
            <span style={{ fontWeight:700, fontSize:15 }}>{MONTHS[current.getMonth()]} {current.getFullYear()}</span>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={nextMonth}><ChevronRight size={16}/></button>
          </div>

          {/* Days header */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', padding:'10px 16px 0' }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'var(--gray-400)', paddingBottom:8 }}>{d}</div>
            ))}
          </div>

          {/* Date cells */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', padding:'0 16px 16px', gap:2 }}>
            {cells.map((day, i) => {
              const dayEvs = eventsOn(day)
              const isToday = day && isSameDay(day, today)
              const isSel   = day && selDay && isSameDay(day, selDay)
              return (
                <div key={i} onClick={() => day && setSelDay(isSel ? null : day)}
                  style={{
                    minHeight:56, padding:'4px 6px', borderRadius:8,
                    cursor: day ? 'pointer' : 'default',
                    background: isSel ? 'var(--indigo-50)' : isToday ? 'rgba(99,102,241,.08)' : 'transparent',
                    border: isToday ? '1px solid var(--indigo-200)' : isSel ? '1px solid var(--indigo-300)' : '1px solid transparent',
                    transition:'background .12s',
                  }}>
                  {day && (
                    <>
                      <div style={{ fontSize:12, fontWeight: isToday ? 800 : 500, color: isToday ? 'var(--indigo-600)' : 'var(--gray-700)', marginBottom:3, textAlign:'right' }}>
                        {day.getDate()}
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>
                        {dayEvs.slice(0,3).map(ev => {
                          const t = TYPE[ev.type]
                          return (
                            <div key={ev.id} style={{
                              fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:4,
                              background:t.bg, color:t.color, lineHeight:1.4,
                              maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                            }}>
                              {ev.title}
                            </div>
                          )
                        })}
                        {dayEvs.length > 3 && (
                          <div style={{ fontSize:9, color:'var(--gray-400)', padding:'1px 4px' }}>+{dayEvs.length-3}</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* Selected day detail */}
          {selDay && (
            <div style={{ borderTop:'1px solid var(--gray-100)', padding:'16px 20px' }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:'var(--gray-700)' }}>
                {selDay.toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
                <span style={{ fontSize:12, fontWeight:400, color:'var(--gray-400)', marginLeft:8 }}>
                  {selEvents.length} event
                </span>
              </div>
              {selEvents.length === 0 ? (
                <div style={{ fontSize:12, color:'var(--gray-400)' }}>Tidak ada event pada hari ini</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {selEvents.map(ev => <EventRow key={ev.id} ev={ev}/>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar: upcoming */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* Legend */}
          <div className="card" style={{ padding:'14px 16px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--gray-400)', textTransform:'uppercase', letterSpacing:.4, marginBottom:10 }}>Keterangan</div>
            {Object.entries(TYPE).map(([k,v]) => (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <div style={{ width:10, height:10, borderRadius:3, background:v.color, flexShrink:0 }}/>
                <span style={{ fontSize:12, color:'var(--gray-600)' }}>{v.label}</span>
              </div>
            ))}
          </div>

          {/* Upcoming */}
          <div className="card">
            <div className="card-header">
              <span style={{ fontWeight:700, fontSize:13 }}>Mendatang</span>
              <span style={{ fontSize:11, color:'var(--gray-400)' }}>30 hari ke depan</span>
            </div>
            {loading ? (
              <div style={{ padding:8 }}><Sk.CardList n={5} avatar={false}/></div>
            ) : upcoming.length === 0 ? (
              <div className="empty-state" style={{ padding:32 }}>
                <Calendar size={24} color="var(--gray-200)"/>
                <p className="empty-state-text" style={{ fontSize:12 }}>Tidak ada event mendatang</p>
              </div>
            ) : (
              <div style={{ maxHeight:480, overflowY:'auto' }}>
                {upcoming.map(ev => {
                  const daysLeft = Math.ceil((ev.date - today) / 86400000)
                  return (
                    <div key={ev.id} style={{ padding:'10px 16px', borderTop:'1px solid var(--gray-100)', display:'flex', gap:10 }}>
                      {/* Date badge */}
                      <div style={{ flexShrink:0, textAlign:'center', width:38, padding:'4px 0', background:'var(--gray-50)', borderRadius:8, border:'1px solid var(--gray-200)' }}>
                        <div style={{ fontSize:15, fontWeight:800, color:'var(--gray-800)', lineHeight:1 }}>{ev.date.getDate()}</div>
                        <div style={{ fontSize:9, fontWeight:600, color:'var(--gray-400)', textTransform:'uppercase' }}>{MONTHS[ev.date.getMonth()].slice(0,3)}</div>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:11, fontWeight:700, padding:'1px 6px', borderRadius:4, background:TYPE[ev.type].bg, color:TYPE[ev.type].color, display:'inline-block', marginBottom:3 }}>
                          {TYPE[ev.type].label}
                        </div>
                        <div style={{ fontSize:12, fontWeight:600, color:'var(--gray-800)', lineHeight:1.3, marginBottom:2 }}>{ev.title}</div>
                        <div style={{ fontSize:10, color:'var(--gray-400)' }}>{ev.courseCode} · {daysLeft === 0 ? 'Hari ini' : daysLeft < 0 ? `${Math.abs(daysLeft)}h lalu` : `${daysLeft}h lagi`}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function EventRow({ ev }) {
  const t = TYPE[ev.type]
  const I = t.icon
  return (
    <div style={{ display:'flex', gap:10, padding:'8px 12px', borderRadius:8, background:t.bg, border:`1px solid ${t.color}22` }}>
      <I size={14} color={t.color} style={{ flexShrink:0, marginTop:1 }}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:700, color:t.color }}>{t.label}</div>
        <div style={{ fontSize:13, fontWeight:600, color:'var(--gray-800)' }}>{ev.title}</div>
        <div style={{ fontSize:11, color:'var(--gray-500)', marginTop:2 }}>{ev.detail}</div>
        {ev.courseCode && <div style={{ fontSize:10, color:'var(--gray-400)', marginTop:1 }}>{ev.courseCode} – {ev.courseName}</div>}
      </div>
    </div>
  )
}
