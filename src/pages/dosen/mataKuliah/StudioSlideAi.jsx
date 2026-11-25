// Studio slide AI untuk satu materi (pertemuan biasa): outline, SPA, video & soal video,
// impor HTML, pratinjau, unduh, dan simpan ke silabus. Tampilan ada di StudioSlide; komponen ini
// memegang data dan pemanggilan AI. Dipasang saat studio dibuka, dilepas saat ditutup.
import { useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth'
import { useConfirm } from '@/components/ui/useConfirm'
import { generateSlideContent, generateWebSlideData, generateSingleSlide, generateSingleWebSlideData, PROGRES_MENUNGGU } from '@/lib/ai'
import { generateWebSlideHtml } from '@/lib/webslideTemplate'
import { parseWebSlideHtml, WebSlideImportError } from '@/lib/webslideImport'
import { slideVideo, spaDariSlideVideo, terapkanSlideVideo } from '@/lib/sisipSlide'
import StudioSlide from './StudioSlide'

/**
 * @param {object}   course     kursus terpilih
 * @param {object}   meeting    materi yang dibuka di studio
 * @param {object[]} materials  semua materi kursus (judul pertemuan lain untuk prompt AI)
 * @param {Function} onClose    studio ditutup
 * @param {Function} onSaved    rancangan tersimpan ke silabus
 */
export default function StudioSlideAi({ course, meeting, materials = [], onClose, onSaved }) {
  const { profile } = useAuth()
  const { confirmDialog, showConfirm } = useConfirm()
  const selectedCourse = course
  const activeMeeting = meeting

  const [loadingSlide, setLoadingSlide] = useState(false)
  const [generatingWebSlide, setGeneratingWebSlide] = useState(false)
  const [savingSlide, setSavingSlide] = useState(false)
  const [slideOutline, setSlideOutline] = useState(meeting.slide_content || null)
  const [webslideData, setWebslideData] = useState(meeting.webslide_content || null)
  const [aiSlideProgressText, setAiSlideProgressText] = useState('')

  const [regeneratingSlideNo, setRegeneratingSlideNo] = useState(null)
  const [regeneratingLayoutSlideNo, setRegeneratingLayoutSlideNo] = useState(null)
  const [snapshotSlide, setSnapshotSlide] = useState(() => JSON.stringify({ o: meeting.slide_content || null, w: meeting.webslide_content || null })) // isi yang tersimpan di database

  const handleAiSlideProgress = (event) => {
    if (typeof event === 'string') {
      setAiSlideProgressText(event)
    } else if (event && event.type === 'chunk') {
      const chars = event.text.length
      setAiSlideProgressText(`AI sedang membangun SPA... (${chars.toLocaleString('id-ID')} karakter)`)
    }
  }


  // Outline/SPA di studio berbeda dengan yang tersimpan di database.
  const slideBelumDisimpan = JSON.stringify({ o: slideOutline, w: webslideData }) !== snapshotSlide

  async function tutupSlideModal() {
    if (slideBelumDisimpan) {
      const ok = await showConfirm({
        title: 'Tutup tanpa menyimpan?',
        message: 'Perubahan outline, slide video, dan pertanyaan video belum tersimpan ke silabus, jadi peserta belum akan melihatnya. Tekan "Simpan ke Silabus" bila ingin menyimpannya.',
        confirmLabel: 'Tutup tanpa menyimpan',
        variant: 'danger',
      })
      if (!ok) return
    }
    onClose?.()
  }

  async function handleGenerateSlideOutline() {
    setLoadingSlide(true)
    setAiSlideProgressText("Menghubungi Gateway API Server...")

    let subTimer = null
    const steps = [
      "Menganalisis Kemampuan Akhir & Bahan Kajian...",
      "Mengintegrasikan Referensi Pustaka RPS...",
      "Memetakan sub-topik & merancang 26–34 bagian materi...",
      "Mengembangkan Contoh Kasus & Penerapan Industri...",
      "Menyusun Perbandingan Konsep & Penjelasan Detail...",
      "Mempersiapkan Output Draft Slide..."
    ]
    let currentStep = 0

    const handleProgress = (event) => {
      if (typeof event === 'string') {
        if (event === PROGRES_MENUNGGU) {
          setAiSlideProgressText(steps[0])
          subTimer = setInterval(() => {
            currentStep++
            if (currentStep < steps.length) {
              setAiSlideProgressText(steps[currentStep])
            } else {
              setAiSlideProgressText("AI sedang merampungkan konten... Mohon tunggu sebentar lagi...")
            }
          }, 2500)
        } else {
          if (subTimer) clearInterval(subTimer)
          setAiSlideProgressText(event)
        }
      } else if (event && event.type === 'chunk') {
        if (subTimer) clearInterval(subTimer)
        const slideMatches = event.text.match(/"slide_no"\s*:\s*(\d+)/g)
        let currentSlide = 1
        if (slideMatches && slideMatches.length > 0) {
          const lastMatch = slideMatches[slideMatches.length - 1]
          const numMatch = lastMatch.match(/\d+/)
          if (numMatch) currentSlide = parseInt(numMatch[0])
        }
        setAiSlideProgressText(`AI sedang menyusun Slide ${currentSlide}... (${event.text.length.toLocaleString('id-ID')} karakter)`)
      }
    }

    try {
      const result = await generateSlideContent(
        selectedCourse.name,
        activeMeeting.week_number,
        activeMeeting.title,
        activeMeeting.description,
        selectedCourse.referensi || [],
        handleProgress,
        {
          // Judul pertemuan lain agar AI tidak mengambil alih materinya.
          pertemuanLain: [...new Map(
            materials
              .filter(m => m.week_number && m.week_number !== activeMeeting.week_number)
              .map(m => [m.week_number, `Pertemuan ${m.week_number}: ${m.title}`])
          ).values()],
        }
      )
      setSlideOutline(result)
      toast.success("Outline slide berhasil disusun AI! 🤖")
    } catch (err) {
      toast.error("Gagal generate outline slide: " + err.message)
    } finally {
      if (subTimer) clearInterval(subTimer)
      setLoadingSlide(false)
      setAiSlideProgressText('')
    }
  }

  async function handleRegenerateSlide(slideNo, slideTitle, currentContent) {
    setRegeneratingSlideNo(slideNo)
    try {
      const result = await generateSingleSlide(
        selectedCourse.name,
        activeMeeting.week_number,
        activeMeeting.title,
        slideNo,
        slideTitle,
        currentContent
      )

      if (result && result.content) {
        const updatedSlides = slideOutline.slides.map(s => {
          if (s.slide_no === slideNo) {
            return {
              ...s,
              title: result.title || s.title,
              content: result.content,
              image_url: s.image_url // Keep existing image/media url
            }
          }
          return s
        })

        setSlideOutline({
          ...slideOutline,
          slides: updatedSlides
        })

        // Sync changes to webslideData (SPA Layout)
        syncWebSlideWithOutline(updatedSlides, slideNo, 'update')

        toast.success(`Slide ${slideNo} berhasil di-generate ulang! 🤖`)
      } else {
        throw new Error("Respons AI tidak valid")
      }
    } catch (err) {
      toast.error(`Gagal meregenerasi Slide ${slideNo}: ` + err.message)
    } finally {
      setRegeneratingSlideNo(null)
    }
  }

  async function handleRegenerateSlideLayout(slideNo) {
    if (!slideOutline) return
    const outlineSlide = slideOutline.slides.find(s => s.slide_no === slideNo)
    if (!outlineSlide) return
    if (slideVideo(outlineSlide)) {
      // Slide video selalu satu pemutar video satu layar; tidak perlu AI.
      setWebslideData({
        ...webslideData,
        slides: (webslideData?.slides || []).map(s => s.slide_no === slideNo ? spaDariSlideVideo(outlineSlide) : s),
      })
      return
    }

    setRegeneratingLayoutSlideNo(slideNo)
    try {
      const prodiName = profile?.program_studi || 'Teknik Informatika'
      const result = await generateSingleWebSlideData(
        selectedCourse.name,
        prodiName,
        activeMeeting.week_number,
        slideNo,
        outlineSlide
      )

      if (result && result.layout) {
        // Keep the outline slide's image_url if it was set
        if (outlineSlide.image_url) {
          result.image_url = outlineSlide.image_url
        }

        const updatedWebslides = (webslideData?.slides || []).map(s => {
          if (s.slide_no === slideNo) {
            return result
          }
          return s
        })

        setWebslideData({
          ...webslideData,
          slides: updatedWebslides
        })
        toast.success(`Layout SPA untuk Slide ${slideNo} berhasil di-generate ulang! 🎨`)
      } else {
        throw new Error("Respons AI tidak valid")
      }
    } catch (err) {
      toast.error(`Gagal meregenerasi layout Slide ${slideNo}: ` + err.message)
    } finally {
      setRegeneratingLayoutSlideNo(null)
    }
  }

  // ── Sync Slide Outline with WebSlide Layouts (Student SPA) ──
  function syncWebSlideWithOutline(updatedOutlineSlides, activeSlideNo = null, actionType = 'update') {
    if (!webslideData || !webslideData.slides) return

    let updatedWebslides = [...webslideData.slides]

    if (actionType === 'delete') {
      updatedWebslides = updatedWebslides.filter(s => s.slide_no !== activeSlideNo)
      updatedWebslides = updatedWebslides.map((s, idx) => ({ ...s, slide_no: idx + 1 }))
    } else if (actionType === 'update') {
      const outlineSlide = updatedOutlineSlides.find(s => s.slide_no === activeSlideNo)
      if (outlineSlide) {
        updatedWebslides = updatedWebslides.map(s => {
          if (s.slide_no === activeSlideNo && slideVideo(outlineSlide)) return spaDariSlideVideo(outlineSlide)
          if (s.slide_no === activeSlideNo) {
            const newTitle = outlineSlide.title
            const newImgUrl = outlineSlide.image_url || s.image_url
            const newContent = outlineSlide.content || []

            let updatedSlide = {
              ...s,
              title: newTitle,
              image_url: newImgUrl,
              content: newContent
            }

            if (s.layout === 'split') {
              updatedSlide.split_right = newContent
            } else if (s.layout === 'list') {
              updatedSlide.list_items = newContent.map(text => ({ text, color: 'blue' }))
            } else if (s.layout === 'grid') {
              updatedSlide.grid_items = newContent.map((desc, i) => ({ 
                title: `Poin ${i + 1}`, 
                desc, 
                icon: 'fa-solid fa-lightbulb' 
              }))
            } else if (s.layout === 'media') {
              updatedSlide.description = newContent.join(' ')
            } else if (s.layout === 'accordion') {
              updatedSlide.accordion_items = newContent.map((content, i) => ({ 
                header: `Poin ${i + 1}`, 
                content 
              }))
            }

            return updatedSlide
          }
          return s
        })
      }
    }

    setWebslideData({
      ...webslideData,
      slides: updatedWebslides
    })
  }

  async function handleGenerateWebSlide() {
    if (!slideOutline) return
    setGeneratingWebSlide(true)
    setAiSlideProgressText("Menganalisis materi slide & membangun tata letak SPA interaktif...")
    try {
      const prodiName = profile?.program_studi || 'Teknik Informatika'
      const result = await generateWebSlideData(
        selectedCourse.name,
        prodiName,
        activeMeeting.week_number,
        slideOutline,
        handleAiSlideProgress
      )

      // Merge custom image/video URLs from the outline slides
      if (result && result.slides && slideOutline && slideOutline.slides) {
        result.slides = result.slides.map(s => {
          const outlineSlide = slideOutline.slides.find(os => os.slide_no === s.slide_no)
          if (outlineSlide && outlineSlide.image_url) {
            return {
              ...s,
              image_url: outlineSlide.image_url
            }
          }
          return s
        })
      }

      if (result?.slides) result.slides = terapkanSlideVideo(slideOutline.slides, result.slides)
      setWebslideData(result)
      toast.success("Aplikasi SPA Slide berhasil dibangun! 🎬")
    } catch (err) {
      toast.error("Gagal membangun SPA Slide: " + err.message)
    } finally {
      setGeneratingWebSlide(false)
      setAiSlideProgressText('')
    }
  }

  // Impor file HTML WebSlide (kerangka SYSTRACT) menjadi outline + SPA.
  // Hasilnya belum tersimpan sampai instruktur menekan "Simpan Rancangan Slide ke Silabus".
  async function handleImportHtml(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 5 MB.')
      return
    }
    if (slideOutline || webslideData) {
      const ok = await showConfirm({
        title: 'Ganti slide yang ada?',
        message: 'Outline dan tampilan SPA pertemuan ini akan diganti dengan isi file HTML. Perubahan baru tersimpan setelah Anda menekan Simpan.',
        confirmLabel: 'Ya, impor',
      })
      if (!ok) return
    }
    try {
      const { webslide, outline } = parseWebSlideHtml(await file.text())
      setSlideOutline(outline)
      setWebslideData(webslide)
      toast.success(`${webslide.slides.length} bagian diimpor. Periksa lewat "Buka Preview Presentasi", lalu simpan.`, { duration: 6000 })
    } catch (err) {
      if (err instanceof WebSlideImportError) toast.error(err.message, { duration: 6000 })
      else {
        console.error('[SYSTRACT] Impor HTML gagal:', err)
        toast.error('File HTML tidak dapat dibaca.')
      }
    }
  }

  async function handleSaveAiSlideContent() {
    setSavingSlide(true)
    const { error } = await supabase
      .from('materials')
      .update({
        slide_content: slideOutline,
        webslide_content: webslideData
      })
      .eq('id', activeMeeting.id)

    if (error) {
      if (error.message?.includes('column')) {
        toast.error('⚠️ Struktur database belum sesuai versi aplikasi. Hubungi admin SYSTRACT.', { duration: 6000 })
      } else {
        toast.error('Gagal menyimpan ke database: ' + error.message)
      }
    } else {
      toast.success('Rancangan Slide berhasil disimpan ke Silabus!')
      setSnapshotSlide(JSON.stringify({ o: slideOutline, w: webslideData }))
      onSaved?.()
    }
    setSavingSlide(false)
  }

  function handlePreviewWebSlide() {
    if (!webslideData) return
    const prodiName = profile?.program_studi || 'Teknik Informatika'
    localStorage.setItem('webslide_preview_data', JSON.stringify({
      courseName: selectedCourse.name,
      prodiName,
      weekNumber: activeMeeting.week_number,
      webslideData
    }))
    window.open('/webslide-preview', '_blank')
  }

  function handleDownloadWebSlide() {
    if (!webslideData) return
    const prodiName = profile?.program_studi || 'Teknik Informatika'
    const htmlContent = generateWebSlideHtml(selectedCourse.name, prodiName, activeMeeting.week_number, webslideData)
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)
    
    const cleanCourseName = selectedCourse.name.replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `WebSlide_Pertemuan_${activeMeeting.week_number}_${cleanCourseName}.html`
    
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    }, 100)
    
    toast.success('WebSlide HTML berhasil diunduh!')
  }

  function handleCopySlideOutline() {
    if (!slideOutline) return
    let text = `=== ${slideOutline.title} ===\n\n`
    slideOutline.slides?.forEach(slide => {
      text += `Slide ${slide.slide_no}: ${slide.title}\n`
      slide.content?.forEach(poin => {
        text += `- ${poin}\n`
      })
      text += `\n`
    })
    navigator.clipboard.writeText(text)
    toast.success('Outline slide berhasil disalin ke clipboard!')
  }

  return (
    <>
    <StudioSlide
      meeting={activeMeeting}
      courseName={selectedCourse?.name}
      slideOutline={slideOutline}
      setSlideOutline={setSlideOutline}
      webslideData={webslideData}
      setWebslideData={setWebslideData}
      sibuk={{
        outline: loadingSlide,
        spa: generatingWebSlide,
        teks: aiSlideProgressText,
        simpan: savingSlide,
        kontenNo: regeneratingSlideNo,
        layoutNo: regeneratingLayoutSlideNo,
      }}
      belumDisimpan={slideBelumDisimpan}
      konfirmasi={showConfirm}
      onTutup={tutupSlideModal}
      onSimpan={handleSaveAiSlideContent}
      onGenerateOutline={handleGenerateSlideOutline}
      onGenerateSpa={handleGenerateWebSlide}
      onPratinjau={handlePreviewWebSlide}
      onUnduhHtml={handleDownloadWebSlide}
      onImporFile={handleImportHtml}
      onSalinOutline={handleCopySlideOutline}
      onRegenerateKonten={handleRegenerateSlide}
      onRegenerateLayout={handleRegenerateSlideLayout}
    />
      {confirmDialog}
    </>
  )
}
