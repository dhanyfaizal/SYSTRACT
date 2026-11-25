// Tab "Pendaftar": persetujuan, penolakan, dan pencabutan akses peserta di satu kursus.
import { useEffect, useState } from 'react'
import { Loader2, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useConfirm } from '@/components/ui/useConfirm'

/** onBerubah: dipanggil setelah status pendaftaran berubah (untuk menyegarkan jumlah peserta). */
export default function TabPendaftar({ courseId, onBerubah }) {
  const { confirmDialog, showConfirm } = useConfirm()
  // `versi` dinaikkan untuk memuat ulang; daftar dianggap sedang dimuat sampai hasil untuk
  // kursus & versi yang sama tiba (tanpa setState sinkron di dalam efek).
  const [versi, setVersi] = useState(0)
  const [hasil, setHasil] = useState({ kunci: null, data: [] })
  const kunci = `${courseId}:${versi}`
  const enrollments = hasil.data
  const loadingEnrollments = hasil.kunci !== kunci
  const fetchEnrollments = () => setVersi((v) => v + 1)

  useEffect(() => {
    if (!courseId) return undefined
    let batal = false
    supabase
      .from('enrollments')
      .select('*, student:profiles!student_id(id, full_name, nim, email, avatar_url)')
      .eq('course_id', courseId)
      .order('enrolled_at', { ascending: false })
      .then(({ data, error }) => {
        if (batal) return
        if (error) {
          console.error('[SYSTRACT] Error fetching enrollments:', error)
          toast.error('Gagal memuat daftar pendaftaran mahasiswa')
        }
        setHasil((h) => ({ kunci, data: error ? h.data : data || [] }))
      })
    return () => { batal = true }
  }, [courseId, kunci])

  async function handleApproveEnrollment(enrollId) {
    const toastId = toast.loading('Menyetujui pendaftaran...')
    try {
      const { error } = await supabase
        .from('enrollments')
        .update({ status: 'approved' })
        .eq('id', enrollId)
      if (error) throw error
      toast.success('Pendaftaran disetujui! 🎉', { id: toastId })
      fetchEnrollments()
      onBerubah?.()
    } catch (e) {
      console.error('[SYSTRACT] Error approving enrollment:', e)
      toast.error('Gagal menyetujui pendaftaran', { id: toastId })
    }
  }

  async function handleRejectEnrollment(enrollId, studentName) {
    const ok = await showConfirm({
      title: 'Tolak / Batalkan Pendaftaran?',
      message: `Apakah Anda yakin ingin menolak/membatalkan pendaftaran untuk mahasiswa ${studentName}?`,
      confirmLabel: 'Ya, Batalkan/Tolak',
      variant: 'danger',
    })
    if (!ok) return

    const toastId = toast.loading('Memproses penolakan...')
    try {
      const { error } = await supabase
        .from('enrollments')
        .delete()
        .eq('id', enrollId)
      if (error) throw error
      toast.success('Pendaftaran ditolak/dihapus.', { id: toastId })
      fetchEnrollments()
      onBerubah?.()
    } catch (e) {
      console.error('[SYSTRACT] Error rejecting enrollment:', e)
      toast.error('Gagal menolak pendaftaran', { id: toastId })
    }
  }

  return (
    <>
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Persetujuan Mahasiswa</h3>
        <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 20 }}>Kelola dan konfirmasi pendaftaran mahasiswa ke dalam kursus ini.</p>

        {loadingEnrollments ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 8 }}>
            <Loader2 size={24} className="spinner" style={{ animation: 'spin 1s linear infinite', color: 'var(--indigo-600)' }} />
            <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Memuat pendaftaran...</span>
          </div>
        ) : enrollments.length === 0 ? (
          <div className="empty-state" style={{ padding: 48, textAlign: 'center', border: '1px dashed var(--gray-200)', borderRadius: 10 }}>
            <Users size={32} color="var(--gray-300)" style={{ marginBottom: 8 }} />
            <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-600)', margin: 0 }}>Belum Ada Mahasiswa</p>
            <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4, marginBottom: 0 }}>Belum ada mahasiswa yang terdaftar atau mengajukan pendaftaran di kursus ini.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 'calc(100vh - 360px)' }}>
            {enrollments.map((e, _idx) => {
              const isPending = e.status === 'pending'
              return (
                <div 
                  key={e.id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 14, 
                    padding: '12px 18px', 
                    background: isPending ? '#fffbeb' : '#fff', 
                    border: isPending ? '1px solid #fde68a' : '1px solid var(--gray-200)',
                    borderRadius: 10,
                    transition: 'all 0.2s'
                  }}
                >
                  <div className="avatar" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--indigo-50)', color: 'var(--indigo-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                    {e.student?.full_name?.[0] || 'M'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-900)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {e.student?.full_name}
                      {isPending && (
                        <span style={{ fontSize: 9, background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: 12, fontWeight: 700, border: '1px solid #fde68a' }}>
                          Menunggu Konfirmasi
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
                      NIM: {e.student?.nim || '-'} · Email: {e.student?.email || '-'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {isPending ? (
                      <>
                        <button 
                          className="btn btn-primary btn-sm" 
                          style={{ background: 'var(--success)', borderColor: 'var(--success)', fontSize: 11, padding: '5px 12px', fontWeight: 700 }}
                          onClick={() => handleApproveEnrollment(e.id)}
                        >
                          Setujui
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          style={{ fontSize: 11, padding: '5px 12px' }}
                          onClick={() => handleRejectEnrollment(e.id, e.student?.full_name)}
                        >
                          Tolak
                        </button>
                      </>
                    ) : (
                      <button 
                        className="btn btn-ghost btn-sm" 
                        style={{ color: 'var(--danger)', fontSize: 11, padding: '5px 12px' }}
                        onClick={() => handleRejectEnrollment(e.id, e.student?.full_name)}
                      >
                        Hapus Akses
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {confirmDialog}
    </>
  )
}
