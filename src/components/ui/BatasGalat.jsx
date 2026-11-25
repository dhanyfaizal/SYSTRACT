import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'
import { laporGalat } from '@/lib/pantauGalat'

/**
 * Pengaman error untuk satu bagian halaman (mis. satu tab). Bila bagian ini gagal dirender,
 * hanya bagian ini yang diganti pesan + tombol "Coba lagi"; menu dan tab lain tetap bisa dipakai.
 * Ganti `key` (mis. id kursus) untuk mengosongkan status error saat konteks berubah.
 */
export default class BatasGalat extends Component {
  state = { galat: null }

  static getDerivedStateFromError(galat) { return { galat } }

  componentDidCatch(galat, info) {
    console.error(`[SYSTRACT] Error di ${this.props.nama || 'bagian halaman'}:`, galat, info)
    laporGalat(galat, { bagian: this.props.nama, komponen: info?.componentStack?.split('\n').slice(0, 6).join('\n') })
  }

  render() {
    if (!this.state.galat) return this.props.children
    return (
      <div role="alert" className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        <AlertTriangle size={22} color="#d97706" />
        <strong style={{ fontSize: 14, color: 'var(--gray-800)' }}>{this.props.nama ? `${this.props.nama} gagal ditampilkan` : 'Bagian ini gagal ditampilkan'}</strong>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--gray-500)', maxWidth: 420 }}>
          Bagian lain halaman ini tetap bisa dipakai. Coba lagi, atau muat ulang halaman bila masih gagal.
        </p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => this.setState({ galat: null })}>Coba lagi</button>
        {import.meta.env.DEV && (
          <pre style={{ fontSize: 11, color: 'var(--danger)', background: '#fff1f2', padding: 10, borderRadius: 8, maxWidth: 560, overflow: 'auto', margin: 0 }}>
            {String(this.state.galat)}
          </pre>
        )}
      </div>
    )
  }
}
