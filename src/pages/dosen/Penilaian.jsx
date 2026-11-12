import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import TabBar from './penilaian/TabBar'
import TugasTab from './penilaian/TugasTab'
import UjianTab from './penilaian/UjianTab'
import RekapTab from './penilaian/RekapTab'
import SertifikatTab from './penilaian/SertifikatTab'



export default function Penilaian() {
  const { user }      = useAuth()
  const [tab, setTab] = useState('tugas')

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Penilaian</h1>
        <p className="page-subtitle">Kelola nilai tugas dan ujian mahasiswa</p>
      </div>

      <TabBar active={tab} onChange={setTab} />

      {tab === 'tugas' && <TugasTab userId={user?.id} />}
      {tab === 'ujian' && <UjianTab userId={user?.id} />}
      {tab === 'rekap' && <RekapTab userId={user?.id} />}
      {tab === 'sertifikat' && <SertifikatTab userId={user?.id} />}
    </div>
  )
}
