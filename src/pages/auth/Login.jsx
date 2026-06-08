import { useState, useEffect } from 'react'
import { Navigate }           from 'react-router-dom'
import { Loader2, LogIn }     from 'lucide-react'
import { useAuth }            from '@/contexts/AuthContext'
import toast                  from 'react-hot-toast'

const LOGO_URL = 'https://i.ibb.co.com/kgV7WDhF/Logo-SYS.png'

export default function Login() {
  const { user, loading, signInWithGoogle } = useAuth()
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/dashboard" replace />

  async function handleLogin() {
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch {
      toast.error('Login gagal. Coba lagi.')
      setBusy(false)
    }
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--gray-50)' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--gray-50)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      {/* Decorative blobs */}
      <div style={{
        position: 'fixed', inset: 0, overflow: 'hidden',
        zIndex: 0, pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute', width: 500, height: 500,
          borderRadius: '50%', top: -120, right: -100,
          background: 'radial-gradient(circle, rgba(99,102,241,.12) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', width: 400, height: 400,
          borderRadius: '50%', bottom: -80, left: -80,
          background: 'radial-gradient(circle, rgba(124,58,237,.10) 0%, transparent 70%)',
        }} />
      </div>

      {/* Card */}
      <div className="card" style={{ width: '100%', maxWidth: 400, zIndex: 1 }}>
        <div className="card-body" style={{ padding: '40px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
          {/* Logo */}
          <img src={LOGO_URL} alt="STIKOM Yos Sudarso" style={{ height: 64, objectFit: 'contain', marginBottom: 20 }} />

          {/* Title */}
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--gray-900)', textAlign: 'center', margin: 0 }}>
            SYSTRACT
          </h1>
          <p style={{ fontSize: 13, color: 'var(--gray-500)', textAlign: 'center', marginTop: 4, marginBottom: 32 }}>
            STIKOM Yos Sudarso Training Center
          </p>

          {/* Login button */}
          <button
            className="btn btn-primary"
            onClick={handleLogin}
            disabled={busy}
            style={{ width: '100%', justifyContent: 'center', padding: '11px 20px', fontSize: 14, gap: 10 }}
          >
            {busy
              ? <Loader2 size={16} style={{ animation: 'spin .7s linear infinite' }} />
              : <LogIn size={16} />
            }
            {busy ? 'Mengarahkan…' : 'Masuk dengan Google'}
          </button>

          {/* Divider */}
          <div style={{ width: '100%', height: 1, background: 'var(--gray-100)', margin: '24px 0' }} />

          {/* Note */}
          <p style={{ fontSize: 11, color: 'var(--gray-400)', textAlign: 'center', lineHeight: 1.6 }}>
            Gunakan akun Google pribadi atau akun institusi Anda.<br />
            Akun baru otomatis terdaftar sebagai <strong>Mahasiswa</strong>.
          </p>
        </div>
      </div>

      <p style={{ marginTop: 20, fontSize: 11, color: 'var(--gray-400)', zIndex: 1 }}>
        © {new Date().getFullYear()} STIKOM Yos Sudarso. Hak Cipta Dilindungi.
      </p>
    </div>
  )
}
