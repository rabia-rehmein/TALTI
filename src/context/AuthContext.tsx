import { onAuthStateChanged, type User } from 'firebase/auth'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { auth } from '../lib/firebase'

type AuthState = {
  user: User | null
  ready: boolean
  /** Increments after `refreshUser`; use in effect deps when reading `user.emailVerified` etc. */
  authSeq: number
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [authSeq, setAuthSeq] = useState(0)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next)
      setReady(true)
      setAuthSeq((s) => s + 1)
    })
    return unsub
  }, [])

  const refreshUser = useCallback(async () => {
    const u = auth.currentUser
    if (!u) return
    await u.reload()
    setUser(auth.currentUser)
    setAuthSeq((s) => s + 1)
  }, [])

  const value = useMemo(
    () => ({ user, ready, authSeq, refreshUser }),
    [user, ready, authSeq, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Hook colocated with provider; Fast Refresh still updates the provider tree.
// eslint-disable-next-line react-refresh/only-export-components -- useAuth is part of the auth module surface
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
