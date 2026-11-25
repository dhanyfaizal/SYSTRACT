// Hook bersama tab Penilaian: daftar kursus yang diampu dan data per kursus terpilih.
// Status "memuat" diturunkan dari data (bukan setState di dalam efek), dan respons yang datang
// terlambat setelah kursus diganti diabaikan.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMuatData } from '@/hooks/useMuatData'

/**
 * Kursus yang diampu instruktur; kursus pertama terpilih otomatis.
 * @returns {{ courses: object[], courseId: string, setCourseId: Function, siap: boolean }}
 */
export function useKursusDiampu(userId) {
  const [hasil, setHasil] = useState({ uid: null, courses: [] })
  const [pilihan, setPilihan] = useState('')

  useEffect(() => {
    if (!userId) return undefined
    let batal = false
    supabase.from('courses').select('id,name,code').eq('dosen_id', userId).order('name')
      .then(({ data, error }) => {
        if (batal) return
        if (error) console.error('[SYSTRACT] kursus diampu:', error)
        setHasil({ uid: userId, courses: data || [] })
      })
    return () => { batal = true }
  }, [userId])

  const siap = !!userId && hasil.uid === userId
  const courses = siap ? hasil.courses : []
  const courseId = courses.some((c) => c.id === pilihan) ? pilihan : (courses[0]?.id || '')
  return { courses, courseId, setCourseId: setPilihan, siap }
}

/** Data untuk satu kursus; lihat useMuatData. */
export const useDataKursus = useMuatData
