import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canAccessApp } from '../lib/authUtils'
import styles from './GlassHeader.module.css'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `${styles.link}${isActive ? ` ${styles.linkActive}` : ''}`

const MOBILE_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/design', label: 'Design' },
  { to: '/profile', label: 'Profile' },
  { to: '/cart', label: 'Cart' },
] as const

export function GlassHeader() {
  const [open, setOpen] = useState(false)
  const { user, ready } = useAuth()

  let sessionLabel: string | null = null
  if (ready && user && canAccessApp(user)) {
    const name = user.displayName?.trim()
    sessionLabel = name
      ? (name.split(/\s+/)[0] ?? 'Account')
      : (user.email?.split('@')[0] ?? 'Account')
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const headerClassName = `${styles.header}${open ? ` ${styles.headerOpen}` : ''}`

  return (
    <>
      <header className={headerClassName}>
        <div className={styles.inner}>
          <NavLink
            to="/"
            className={styles.brand}
            end
            onClick={() => setOpen(false)}
          >
            Talti
          </NavLink>

          <nav className={styles.nav} aria-label="Main">
            <NavLink to="/" className={linkClass} end>Home</NavLink>
            <NavLink to="/design" className={linkClass}>Design</NavLink>
            <NavLink to="/profile" className={linkClass}>Profile</NavLink>
            <NavLink to="/cart" className={linkClass}>Cart</NavLink>
          </nav>

          <div className={styles.end}>
            {sessionLabel ? (
              <NavLink to="/profile" className={styles.signIn}>
                {sessionLabel}
              </NavLink>
            ) : (
              <NavLink to="/auth" className={styles.signIn}>
                Sign in
              </NavLink>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={styles.mobileTrigger}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            <span
              className={`${styles.hamburger}${open ? ` ${styles.hamburgerOpen}` : ''}`}
              aria-hidden
            >
              <span className={styles.hamburgerLine} />
              <span className={styles.hamburgerLine} />
            </span>
          </button>
        </div>
      </header>

      <AnimatePresence>
        {open ? (
          <motion.div
            className={styles.mobileMenu}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className={styles.mobileMenuInner}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <nav className={styles.mobileNav} aria-label="Mobile">
                <div className={styles.mobileNavList}>
                  {MOBILE_LINKS.map((l, idx) => (
                    <motion.div
                      key={l.to}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: 0.04 + idx * 0.035,
                        duration: 0.45,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      <NavLink
                        to={l.to}
                        end={'end' in l ? l.end : false}
                        className={styles.mobileLink}
                        onClick={() => setOpen(false)}
                      >
                        <span className={styles.mobileLinkIndex}>
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        {l.label}
                      </NavLink>
                    </motion.div>
                  ))}
                </div>
              </nav>

              <div className={styles.mobileFooter}>
                <span className={styles.mobileFootnote}>
                  Upload · Preview · Order
                </span>
                {sessionLabel ? (
                  <NavLink
                    to="/profile"
                    className={styles.mobileButton}
                    onClick={() => setOpen(false)}
                  >
                    {sessionLabel}
                  </NavLink>
                ) : (
                  <NavLink
                    to="/auth"
                    className={styles.mobileButton}
                    onClick={() => setOpen(false)}
                  >
                    Sign in
                  </NavLink>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
