import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { serverSignOut, useMe } from '../lib/api'
import { SIGNED_OUT_EVENT, clearToken, getToken, setToken } from '../lib/session'

/**
 * Who is signed in.
 *
 * Accounts are optional: every tool works without one, and only projects —
 * saving, the methods export, sharing — need an owner. So "signed out" is a
 * normal state for the whole app to render in, not a wall in front of it.
 */

const AuthContext = createContext(null)

// Queries whose answer depends on who is asking. Cleared on sign-out so the
// next person at this browser can't see the last one's projects.
const USER_SCOPED = [['projects'], ['project'], ['methods'], ['me']]

export function AuthProvider({ children }) {
  const qc = useQueryClient()
  const [token, setTokenState] = useState(getToken)
  const me = useMe(token)

  const forget = useCallback(() => {
    setTokenState(null)
    USER_SCOPED.forEach((queryKey) => qc.removeQueries({ queryKey }))
  }, [qc])

  useEffect(() => {
    const onSignedOut = () => forget()
    // Signing in or out in another tab applies here too.
    const onStorage = (e) => {
      if (e.key !== 'helix-session') return
      if (e.newValue) setTokenState(e.newValue)
      else forget()
    }
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut)
      window.removeEventListener('storage', onStorage)
    }
  }, [forget])

  const signedIn = useCallback(
    ({ token: next, user }) => {
      setToken(next)
      qc.setQueryData(['me', next], user)
      setTokenState(next)
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    [qc],
  )

  const signOut = useCallback(async () => {
    await serverSignOut()
    clearToken()
    forget()
  }, [forget])

  const value = useMemo(
    () => ({
      user: token ? me.data || null : null,
      // True only while a stored token is being checked — so pages don't
      // flash "sign in" at someone who is signed in.
      checking: Boolean(token) && me.isLoading,
      signedIn,
      signOut,
    }),
    [token, me.data, me.isLoading, signedIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
