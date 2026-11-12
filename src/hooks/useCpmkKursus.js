import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/** Daftar CPMK ({ kode, deskripsi }) milik kursus, untuk isian pemetaan CPMK di form dosen. */
export function useCpmkKursus(courseId) {
  const [cpmk, setCpmk] = useState([])
  useEffect(() => {
    if (!courseId) return undefined
    let batal = false
    supabase.from('courses').select('cpmk').eq('id', courseId).maybeSingle().then(({ data }) => {
      if (batal) return
      const daftar = Array.isArray(data?.cpmk) ? data.cpmk.filter((c) => c?.kode) : []
      setCpmk(daftar)
    })
    return () => { batal = true }
  }, [courseId])
  return courseId ? cpmk : []
}
