import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canAccessApp } from '../lib/authUtils'
import { AppFooter } from './AppFooter'
import { useFooterChrome } from './FooterChromeContext'
import { GlassHeader } from './GlassHeader'
import styles from './Layout.module.css'

export function Layout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, ready, authSeq } = useAuth()
  const { suppressFooter } = useFooterChrome()
  const showFooter = pathname !== '/' && pathname !== '/auth' && !suppressFooter

  useEffect(() => {
    if (!ready || !user) return
    if (pathname === '/auth') return
    if (!canAccessApp(user)) {
      navigate('/auth', { replace: true, state: { needsVerification: true } })
    }
  }, [ready, user, user?.emailVerified, authSeq, pathname, navigate])

  return (
    <div className={styles.layout}>
      <GlassHeader />
      <main className={styles.main}>
        <Outlet />
      </main>
      {showFooter ? <AppFooter /> : null}
    </div>
  )
}
