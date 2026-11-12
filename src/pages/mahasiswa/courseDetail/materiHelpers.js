import { User } from 'lucide-react'


export const COUNTDOWN_SEC = 180 // 3 Menit untuk membaca/menonton materi



// Helper mapping untuk tipe materi
export const MATTYPE = {
  'video/youtube':                        { label: 'Video YouTube', icon: '🎬', color: '#ff0000', bg: '#fff0f0' },
  'application/vnd.google-apps.document': { label: 'Google Drive',  icon: '📁', color: '#4285f4', bg: '#e8f0fe' },
  'application/pdf':                      { label: 'PDF Dokumen',   icon: '📄', color: '#ef4444', bg: '#fef2f2' },
  'text/html':                            { label: 'Artikel/Web',   icon: '🌐', color: '#10b981', bg: '#f0fdf4' },
}

export function getMatType(mime) { return MATTYPE[mime] || { label: 'Tautan Link', icon: '🔗', color: 'var(--gray-500)', bg: 'var(--gray-100)' } }


// Helper YouTube embed ID
export function getYouTubeId(url = '') {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}


export function getEmbedUrl(mime, url = '') {
  if (mime === 'video/youtube') {
    const id = getYouTubeId(url)
    if (!id) return null
    let origin = ''
    if (typeof window !== 'undefined') {
      origin = window.location.origin
      if (!origin || origin.startsWith('file:')) {
        origin = 'https://systract.vercel.app'
      }
    } else {
      origin = 'https://systract.vercel.app'
    }
    const originParam = origin ? `&origin=${encodeURIComponent(origin)}` : ''
    return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&enablejsapi=1${originParam}`
  }
  if (mime === 'application/vnd.google-apps.document') {
    const id = url.match(/\/file\/d\/([^/?\s]+)/)?.[1] || url.match(/[?&]id=([^&]+)/)?.[1]
    return id ? `https://drive.google.com/file/d/${id}/preview` : null
  }
  if (mime === 'application/pdf') {
    const id = url.match(/\/file\/d\/([^/?\s]+)/)?.[1]
    if (id) return `https://drive.google.com/file/d/${id}/preview`
    return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`
  }
  return null
}


// Map Kompetensi berdasarkan nama kursus
export function getCompetencies(courseName = '') {
  const name = courseName.toLowerCase()
  if (name.includes('react') || name.includes('frontend')) {
    return [
      'Developing Interactive User Interfaces using React.js Components',
      'Implementing State Management with React Lifecycle and Context API',
      'Integrating Frontend Interfaces with Restful APIs and Supabase Cloud Services',
      'Deploying Web Application to Vercel Hosting Platform'
    ]
  }
  if (name.includes('database') || name.includes('sql')) {
    return [
      'Relational Database Modeling & Schema Normalization (1NF, 2NF, 3NF)',
      'Writing Advanced & Optimized SQL Queries, Triggers, and Stored Functions',
      'Managing Security Policies & Row Level Security (RLS) on Supabase Platform',
      'Designing Relational Integrity Constraints & Performance Indexes'
    ]
  }
  if (name.includes('php') || name.includes('backend') || name.includes('laravel')) {
    return [
      'Developing MVC Architecture and Modular REST APIs using Backend PHP/Laravel',
      'Database Migrations & Relational Eloquent ORM Integration',
      'Implementing Secure JWT/OAuth User Authentication & Session Controls',
      'Building Middleware Security & Serverless Functions Routing'
    ]
  }
  return [
    'Understanding Fundamental Theoretical Concepts of the Subject',
    'Practical Skill Execution and System Implementation',
    'Application of Industry Best Practices and Professional Design Standards'
  ]
}
