import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User, Mail, BookOpen, Shield, Edit2, Save, X, Camera,
  Star, Trophy, Zap, Award, CheckCircle, MessageSquare,
  Upload, Loader2, TrendingUp, Clock, Sparkles
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import AvatarPreview from '@/components/AvatarPreview'
import toast from 'react-hot-toast'

// ── Badge definitions (computed dari aktivitas) ─────────────
const BADGE_DEFS = [
  {
    id: 'member',     icon: '🎓', label: 'Anggota SYSTRACT',
    desc: 'Bergabung dengan SYSTRACT',
    check: () => true,
    color: '#4f46e5',
  },
  {
    id: 'first_sub',  icon: '📝', label: 'Pengumpul Pertama',
    desc: 'Kumpulkan tugas pertama kamu',
    check: (stats) => stats.submissions > 0,
    color: '#0ea5e9',
  },
  {
    id: 'reader',     icon: '📚', label: 'Pencinta Buku',
    desc: 'Buka 5 materi perkuliahan',
    check: (stats) => stats.materialViews >= 5,
    color: '#10b981',
  },
  {
    id: 'forum',      icon: '💬', label: 'Diskusi Aktif',
    desc: 'Buat atau balas topik forum',
    check: (stats) => stats.forumPosts > 0,
    color: '#f59e0b',
  },
  {
    id: 'xp10',       icon: '⚡', label: 'Energi Awal',
    desc: 'Kumpulkan 10 XP pertama',
    check: (stats) => stats.totalXp >= 10,
    color: '#8b5cf6',
  },
  {
    id: 'xp50',       icon: '🔥', label: 'Mulai Membara',
    desc: 'Kumpulkan 50 XP',
    check: (stats) => stats.totalXp >= 50,
    color: '#ef4444',
  },
  {
    id: 'xp100',      icon: '🏅', label: 'Seratus XP',
    desc: 'Kumpulkan 100 XP',
    check: (stats) => stats.totalXp >= 100,
    color: '#f59e0b',
  },
  {
    id: 'xp500',      icon: '👑', label: 'Legenda',
    desc: 'Kumpulkan 500 XP',
    check: (stats) => stats.totalXp >= 500,
    color: '#d97706',
  },
  {
    id: 'perfect',    icon: '🎯', label: 'Nilai Sempurna',
    desc: 'Raih nilai 100 pada tugas atau ujian',
    check: (stats) => stats.perfectScore,
    color: '#16a34a',
  },
  {
    id: 'course5',    icon: '🎒', label: 'Multi Kelas',
    desc: 'Terdaftar di 5 mata kuliah',
    check: (stats) => stats.courses >= 5,
    color: '#7c3aed',
  },
]

function timeAgo(iso) {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (m < 1)    return 'Baru saja'
  if (m < 60)   return `${m} mnt lalu`
  if (m < 1440) return `${Math.floor(m/60)} jam lalu`
  return `${Math.floor(m/1440)} hari lalu`
}

export default function ProfilePage() {
  const { profile, user, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [editing,   setEditing]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [form,      setForm]      = useState({})
  const [prodiList, setProdiList] = useState([])
  const [stats,     setStats]     = useState({ totalXp:0, submissions:0, materialViews:0, forumPosts:0, courses:0, perfectScore:false })
  const [activity,  setActivity]  = useState([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [avatarCfg,  setAvatarCfg]  = useState(null)
  const [shopItems,  setShopItems]  = useState([])
  const fileRef = useRef()

  useEffect(() => {
    if (profile) {
      setForm({ ...profile })
      if (profile.role === 'mahasiswa') fetchStats()
    }
  }, [profile])

  useEffect(() => {
    supabase.from('program_studi').select('id,name,code').order('name')
      .then(({ data }) => setProdiList(data || []))
    // Load avatar config + shop items for preview
    if (user) {
      supabase.from('user_avatar_config').select('*').eq('user_id', user.id).maybeSingle()
        .then(({ data }) => setAvatarCfg(data))
      supabase.from('shop_items').select('id,image_url').eq('is_active', true)
        .then(({ data }) => setShopItems(data || []))
    }
  }, [user])

  async function fetchStats() {
    if (!user) return
    setStatsLoading(true)
    const [xpRes, subRes, mvRes, fpRes, crRes, perfRes, actRes] = await Promise.all([
      // Total XP
      supabase.from('points_log').select('points').eq('user_id', user.id),
      // Submissions
      supabase.from('submissions').select('id', { count:'exact', head:true }).eq('student_id', user.id),
      // Material views
      supabase.from('material_views').select('id', { count:'exact', head:true }).eq('student_id', user.id),
      // Forum posts + replies
      supabase.from('forum_replies').select('id', { count:'exact', head:true }).eq('author_id', user.id),
      // Courses enrolled
      supabase.from('enrollments').select('id', { count:'exact', head:true }).eq('student_id', user.id),
      // Perfect scores
      supabase.from('submissions').select('score').eq('student_id', user.id).eq('score', 100).limit(1),
      // Recent activity
      supabase.from('points_log').select('points, reason, created_at').eq('user_id', user.id).order('created_at', { ascending:false }).limit(6),
    ])

    const totalXp = (xpRes.data || []).reduce((s, r) => s + (r.points || 0), 0)
    setStats({
      totalXp,
      submissions:   subRes.count || 0,
      materialViews: mvRes.count  || 0,
      forumPosts:    fpRes.count  || 0,
      courses:       crRes.count  || 0,
      perfectScore:  (perfRes.data || []).length > 0,
    })
    setActivity(actRes.data || [])
    setStatsLoading(false)
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { toast.error('Maks 3MB'); return }
    setUploading(true)
    const ext  = file.name.split('.').pop()
    const path = `avatars/${user.id}.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (upErr) { toast.error('Gagal upload foto'); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const { error: saveErr } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
    if (saveErr) toast.error('Gagal simpan foto')
    else { toast.success('Foto profil diperbarui!'); refreshProfile() }
    setUploading(false)
  }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name:     form.full_name,
      nim:           profile?.role === 'mahasiswa' ? form.nim  : null,
      nidn:          profile?.role === 'dosen'     ? form.nidn : null,
      program_studi: form.program_studi || null,
    }).eq('id', user.id)
    if (error) toast.error('Gagal menyimpan')
    else { toast.success('Profil diperbarui!'); refreshProfile(); setEditing(false) }
    setSaving(false)
  }

  const earnedBadges = BADGE_DEFS.filter(b => b.check(stats))
  const xpLevel = stats.totalXp < 50 ? 1 : stats.totalXp < 150 ? 2 : stats.totalXp < 300 ? 3 : stats.totalXp < 600 ? 4 : 5
  const xpToNext = [50, 150, 300, 600, Infinity][xpLevel - 1]
  const xpPrev   = [0, 50, 150, 300, 600][xpLevel - 1]
  const xpPct    = xpToNext === Infinity ? 100 : Math.min(100, ((stats.totalXp - xpPrev) / (xpToNext - xpPrev)) * 100)

  const itemMap = useMemo(() => {
    const m = new Map()
    shopItems.forEach(i => m.set(i.id, i))
    return m
  }, [shopItems])

  const ROLE_COLORS = { admin:'#dc2626', dosen:'#d97706', mahasiswa:'#4f46e5', guest:'#6b7280' }
  const ROLE_LABELS = { admin:'Administrator', dosen:'Dosen', mahasiswa:'Mahasiswa', guest:'Guest' }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      {/* ── Hero Card ─────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom:20, overflow:'hidden' }}>
        {/* Gradient top bar */}
        <div style={{ height:80, background:'linear-gradient(135deg,#4f46e5,#7c3aed,#a855f7)', position:'relative' }}/>

        <div style={{ padding:'0 24px 24px', marginTop:-40, display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div style={{ display:'flex', alignItems:'flex-end', gap:16 }}>
            {/* Avatar */}
            <div style={{ position:'relative' }}>
              <div style={{
                width:80, height:80, borderRadius:'50%',
                border:'4px solid white', background:'#4f46e5',
                display:'flex', alignItems:'center', justifyContent:'center',
                overflow:'hidden', boxShadow:'0 4px 12px rgba(0,0,0,.15)',
              }}>
                {avatarCfg && itemMap.size > 0 ? (
                  <AvatarPreview config={avatarCfg} items={itemMap} size={80}
                    fallback={{ name: profile?.full_name, avatar_url: profile?.avatar_url }} />
                ) : profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  : <span style={{ fontSize:28, fontWeight:700, color:'white' }}>{profile?.full_name?.[0]||'U'}</span>
                }
                {uploading && (
                  <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Loader2 size={18} color="white" style={{ animation:'spin .7s linear infinite' }}/>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom:4 }}>
              <div style={{ fontSize:20, fontWeight:800, color:'var(--gray-900)' }}>{profile?.full_name || '–'}</div>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginTop:4 }}>
                <span style={{
                  fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:99,
                  background: ROLE_COLORS[profile?.role] || '#6b7280',
                  color:'white',
                }}>
                  {ROLE_LABELS[profile?.role] || 'Guest'}
                </span>
                {profile?.nim  && <span style={{ fontSize:12, color:'var(--gray-500)' }}>NIM: {profile.nim}</span>}
                {profile?.nidn && <span style={{ fontSize:12, color:'var(--gray-500)' }}>NIDN: {profile.nidn}</span>}
                {profile?.program_studi && <span style={{ fontSize:12, color:'var(--gray-500)' }}>{profile.program_studi}</span>}
              </div>
              <div style={{ fontSize:12, color:'var(--gray-400)', marginTop:3, display:'flex', alignItems:'center', gap:4 }}>
                <Mail size={11}/> {profile?.email}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {profile?.role === 'mahasiswa' && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/avatar-editor')}
                style={{ display:'flex', alignItems:'center', gap:5 }}
              >
                <Sparkles size={13} color="#7C3AED" /> Edit Avatar
              </button>
            )}
            <button
              className={editing ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm"}
              onClick={() => editing ? setEditing(false) : setEditing(true)}
              style={{ display:'flex', alignItems:'center', gap:6 }}
            >
              {editing ? <><X size={13}/> Batal</> : <><Edit2 size={13}/> Edit Profil</>}
            </button>
          </div>
        </div>

        {/* Edit form */}
        {editing && (
          <div style={{ borderTop:'1px solid var(--gray-100)', padding:'20px 24px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
              <div className="input-group">
                <label className="input-label">Nama Lengkap</label>
                <input className="input" value={form.full_name||''} onChange={e => setForm(f=>({...f,full_name:e.target.value}))}/>
              </div>
              <div className="input-group">
                <label className="input-label">Program Studi</label>
                <select className="input" value={form.program_studi||''} onChange={e => setForm(f=>({...f,program_studi:e.target.value}))}>
                  <option value="">— Pilih Prodi —</option>
                  {prodiList.map(p => <option key={p.id} value={p.name}>{p.name}{p.code?` (${p.code})`:''}</option>)}
                </select>
              </div>
              {profile?.role === 'mahasiswa' && (
                <div className="input-group">
                  <label className="input-label">NIM</label>
                  <input className="input" value={form.nim||''} onChange={e => setForm(f=>({...f,nim:e.target.value}))}/>
                </div>
              )}
              {profile?.role === 'dosen' && (
                <div className="input-group">
                  <label className="input-label">NIDN/NUPTK</label>
                  <input className="input" value={form.nidn||''} onChange={e => setForm(f=>({...f,nidn:e.target.value}))}/>
                </div>
              )}
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Batal</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ display:'flex', alignItems:'center', gap:6 }}>
                {saving ? <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> : <Save size={13}/>}
                Simpan
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Stats Row ─────────────────────────────────────────── */}
      {profile?.role === 'mahasiswa' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {[
            { label:'Total XP',         value: stats.totalXp,        icon:'⚡', color:'#7c3aed' },
            { label:'Tugas Dikumpul',   value: stats.submissions,    icon:'📝', color:'#0ea5e9' },
            { label:'Materi Dibuka',    value: stats.materialViews,  icon:'📚', color:'#10b981' },
            { label:'Kelas Diikuti',    value: stats.courses,        icon:'🎒', color:'#f59e0b' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding:'16px', textAlign:'center' }}>
              <div style={{ fontSize:22, marginBottom:4 }}>{s.icon}</div>
              <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{statsLoading ? '…' : s.value}</div>
              <div style={{ fontSize:11, color:'var(--gray-400)', fontWeight:600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {/* ── Badges ──────────────────────────────────────────── */}
        <div>
          <div className="card">
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--gray-100)', display:'flex', alignItems:'center', gap:8 }}>
              <Trophy size={15} color="#f59e0b"/>
              <strong style={{ fontSize:14 }}>Badges</strong>
              <span style={{ marginLeft:'auto', fontSize:12, color:'var(--gray-400)' }}>{earnedBadges.length}/{BADGE_DEFS.length}</span>
            </div>

            {/* XP Level bar */}
            {profile?.role === 'mahasiswa' && (
              <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--gray-100)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:'var(--gray-700)' }}>Level {xpLevel}</span>
                  <span style={{ fontSize:11, color:'var(--gray-400)' }}>
                    {stats.totalXp} XP {xpToNext !== Infinity && `/ ${xpToNext} XP`}
                  </span>
                </div>
                <div style={{ height:8, borderRadius:99, background:'var(--gray-100)', overflow:'hidden' }}>
                  <div style={{
                    height:'100%', borderRadius:99, width:`${xpPct}%`,
                    background:'linear-gradient(90deg,#4f46e5,#a855f7)',
                    transition:'width .5s ease',
                  }}/>
                </div>
              </div>
            )}

            <div style={{ padding:'16px 20px', display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
              {BADGE_DEFS.map(b => {
                const earned = b.check(stats)
                return (
                  <div key={b.id} title={b.desc} style={{
                    display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                    borderRadius:10, border:`1px solid ${earned ? b.color+'30' : 'var(--gray-100)'}`,
                    background: earned ? b.color+'08' : 'var(--gray-50)',
                    opacity: earned ? 1 : 0.5,
                    transition:'all .15s',
                  }}>
                    <span style={{ fontSize:20, filter: earned ? 'none' : 'grayscale(1)' }}>{b.icon}</span>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color: earned ? 'var(--gray-800)' : 'var(--gray-400)' }}>
                        {b.label}
                      </div>
                      <div style={{ fontSize:10, color:'var(--gray-400)', lineHeight:1.3 }}>{b.desc}</div>
                    </div>
                    {earned && <CheckCircle size={12} color={b.color} style={{ marginLeft:'auto', flexShrink:0 }}/>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Activity & Info ──────────────────────────────────── */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Account info */}
          <div className="card">
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--gray-100)', display:'flex', alignItems:'center', gap:8 }}>
              <User size={15} color="var(--indigo-600)"/>
              <strong style={{ fontSize:14 }}>Info Akun</strong>
            </div>
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
              {[
                { label:'Email',         value: profile?.email },
                { label:'Role',          value: ROLE_LABELS[profile?.role] || '–' },
                { label:'Program Studi', value: profile?.program_studi || '–' },
                { label:'NIM/NIDN',      value: profile?.nim || profile?.nidn || '–' },
              ].map(row => (
                <div key={row.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:12, color:'var(--gray-500)', fontWeight:600 }}>{row.label}</span>
                  <span style={{ fontSize:13, color:'var(--gray-800)', fontWeight:600, textAlign:'right', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent XP activity */}
          {profile?.role === 'mahasiswa' && (
            <div className="card">
              <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--gray-100)', display:'flex', alignItems:'center', gap:8 }}>
                <TrendingUp size={15} color="#10b981"/>
                <strong style={{ fontSize:14 }}>Aktivitas XP Terbaru</strong>
              </div>
              <div style={{ padding:'12px 20px', display:'flex', flexDirection:'column', gap:8 }}>
                {statsLoading ? (
                  <div style={{ padding:16, display:'flex', justifyContent:'center' }}><div className="spinner"/></div>
                ) : activity.length === 0 ? (
                  <div style={{ textAlign:'center', padding:16, fontSize:12, color:'var(--gray-400)' }}>
                    Belum ada aktivitas XP
                  </div>
                ) : activity.map((a, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{
                      width:28, height:28, borderRadius:'50%',
                      background:'#ecfdf5', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                    }}>
                      <Zap size={13} color="#10b981"/>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:'var(--gray-700)' }}>
                        {a.reason || 'Aktivitas'}
                      </div>
                      <div style={{ fontSize:11, color:'var(--gray-400)' }}>{timeAgo(a.created_at)}</div>
                    </div>
                    <span style={{ fontSize:12, fontWeight:700, color:'#7c3aed' }}>+{a.points} XP</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
