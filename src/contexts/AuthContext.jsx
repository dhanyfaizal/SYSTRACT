import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,         setUser]         = useState(null)
  const [profile,      setProfile]      = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [profileReady, setProfileReady] = useState(false)  // true setelah fetch profile pertama selesai
  const currentUserRef = useRef(null)

  // Load profile in BACKGROUND — does not block the loading state
  async function fetchProfile(userId, authUser = null) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (!error && data) {
        setProfile(data)
        return
      }

      // Row not found — auto-create from Google OAuth metadata
      if (error?.code === 'PGRST116' && authUser) {
        const { data: upserted, error: upsertErr } = await supabase
          .from('profiles')
          .upsert({
            id:         authUser.id,
            email:      authUser.email,
            full_name:  authUser.user_metadata?.full_name
                     || authUser.user_metadata?.name
                     || authUser.email || '',
            avatar_url: authUser.user_metadata?.avatar_url || '',
            role:       'mahasiswa',
          }, { onConflict: 'id' })
          .select()
          .single()

        if (!upsertErr && upserted) setProfile(upserted)
        else console.error('[EduSYS] Profile upsert failed:', upsertErr)
      } else if (error) {
        console.error('[EduSYS] fetchProfile error:', error)
      }
    } catch (e) {
      console.error('[EduSYS] fetchProfile exception:', e)
    } finally {
      setProfileReady(true)  // Selalu tandai selesai, berhasil atau tidak
    }
  }

  useEffect(() => {
    // Safety net — never stay loading > 5 seconds
    const maxWait = setTimeout(() => {
      setLoading(false)
      setProfileReady(true)  // Unblock role-checks juga
    }, 5000)

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        const initialUser = session?.user ?? null
        currentUserRef.current = initialUser
        // 1. Set user state immediately
        setUser(initialUser)

        // 2. Unblock the UI — don't wait for profile
        setLoading(false)
        clearTimeout(maxWait)

        // 3. Load profile in background
        if (initialUser) {
          fetchProfile(initialUser.id, initialUser)
        } else {
          setProfileReady(true)  // Tidak ada user → tidak perlu load profile
        }
      })
      .catch(() => {
        setLoading(false)
        setProfileReady(true)
        clearTimeout(maxWait)
      })

    // Handle subsequent auth events (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'INITIAL_SESSION') return // handled by getSession() above

        const nextUser = session?.user ?? null
        const currentUser = currentUserRef.current
        const isSameUser = currentUser?.id === nextUser?.id

        currentUserRef.current = nextUser
        setUser(nextUser)

        if (!isSameUser) {
          if (nextUser) {
            setProfileReady(false)  // Reset: sedang load profile baru
            fetchProfile(nextUser.id, nextUser) // background, no await
          } else {
            setProfile(null)
            setProfileReady(true)
          }
        } else {
          // Jika user sama, reload/fetch profile di background tanpa mengubah profileReady menjadi false
          if (nextUser) {
            fetchProfile(nextUser.id, nextUser)
          }
        }
      }
    )

    return () => {
      clearTimeout(maxWait)
      subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    currentUserRef.current = null
    setUser(null)
    setProfile(null)
    window.location.replace('/login')
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
    if (error) throw error
  }

  const value = {
    user,
    profile,
    loading,
    profileReady,
    role:        profile?.role ?? 'guest',
    isAdmin:     profile?.role === 'admin',
    isDosen:     profile?.role === 'dosen',
    isMahasiswa: profile?.role === 'mahasiswa',
    signInWithGoogle,
    signOut,
    refreshProfile: () => user && fetchProfile(user.id, user),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
