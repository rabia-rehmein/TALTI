import { FirebaseError } from 'firebase/app'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { auth } from '../lib/firebase'
import { formatAuthError } from '../lib/authErrors'
import {
  loginWithEmailPassword,
  loginWithGoogle,
  registerWithEmailPassword,
  reloadFirebaseUser,
  requestPasswordReset,
  sendVerificationAgain,
  signOutUser,
} from '../lib/authService'
import { canAccessApp } from '../lib/authUtils'

const ease = [0.22, 1, 0.36, 1] as const

const FADE_OUT_MS = 236

const authFormVariants = {
  visible: {
    opacity: 1,
    transition: { duration: 0.34, ease },
  },
  hidden: {
    opacity: 0,
    transition: { duration: 0.22, ease },
  },
} as const

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ')
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.233 17.64 11.925 17.64 9.2z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  )
}

type AuthMode = 'signin' | 'signup'

const inputCls = cn(
  'w-full border-0 border-b border-[color-mix(in_oklab,var(--ink)_10%,transparent)] bg-transparent',
  'py-2.5 font-[family-name:var(--font-sans)]',
  'text-[clamp(0.82rem,0.78rem+0.18vw,0.9rem)] text-[color-mix(in_oklab,var(--ink)_82%,transparent)] outline-none',
  'placeholder:text-[color-mix(in_oklab,var(--ink)_26%,transparent)]',
  'transition-[border-color] duration-200',
  'focus:border-[color-mix(in_oklab,var(--ink)_35%,transparent)]',
)

const msgCls = cn(
  'rounded-xl border px-3 py-2 font-[family-name:var(--font-sans)] text-[0.72rem] leading-relaxed',
)

function friendlyErr(err: unknown): string {
  if (err instanceof FirebaseError) return formatAuthError(err)
  if (err instanceof Error) return err.message
  return formatAuthError(err)
}

export function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, ready, authSeq, refreshUser } = useAuth()

  const [rendered, setRendered] = useState<AuthMode>('signin')
  const [visible, setVisible] = useState(true)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signupSent, setSignupSent] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)

  const needsVerifyPanel = Boolean(user && !canAccessApp(user))
  const stateNeedsVerify = Boolean(
    (location.state as { needsVerification?: boolean } | null)?.needsVerification,
  )

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useEffect(() => {
    if (!ready || !user) return
    if (canAccessApp(user)) {
      navigate('/', { replace: true })
    }
  }, [ready, user, authSeq, navigate])

  const switchMode = (next: AuthMode) => {
    if (next === rendered) return
    timers.current.forEach(clearTimeout)
    timers.current = []

    setVisible(false)

    timers.current.push(
      setTimeout(() => {
        setRendered(next)
        setVisible(true)
        setError(null)
        setSignupSent(false)
        setResetMode(false)
        setResetSuccess(false)
      }, FADE_OUT_MS),
    )
  }

  const closePasswordReset = () => {
    setResetMode(false)
    setResetSuccess(false)
    setError(null)
  }

  const onEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (rendered === 'signin' && resetMode) {
        await requestPasswordReset(email)
        setResetSuccess(true)
      } else if (rendered === 'signup') {
        await registerWithEmailPassword(email, password, fullName)
        setSignupSent(true)
        await refreshUser()
      } else {
        await loginWithEmailPassword(email, password)
        navigate('/', { replace: true })
      }
    } catch (err) {
      setError(friendlyErr(err))
    } finally {
      setBusy(false)
    }
  }

  const onGoogle = async () => {
    setError(null)
    setBusy(true)
    try {
      await loginWithGoogle()
      navigate('/', { replace: true })
    } catch (err) {
      setError(friendlyErr(err))
    } finally {
      setBusy(false)
    }
  }

  const onResend = async () => {
    if (!user) return
    setError(null)
    setBusy(true)
    try {
      await sendVerificationAgain(user)
      setSignupSent(true)
    } catch (err) {
      setError(friendlyErr(err))
    } finally {
      setBusy(false)
    }
  }

  const onVerifiedContinue = async () => {
    if (!user) return
    setError(null)
    setBusy(true)
    try {
      await reloadFirebaseUser(user)
      await refreshUser()
      const current = auth.currentUser
      if (current && canAccessApp(current)) {
        navigate('/', { replace: true })
      } else {
        setError('Still not verified. Open the link in your email, then try again.')
      }
    } catch (err) {
      setError(friendlyErr(err))
    } finally {
      setBusy(false)
    }
  }

  const onSignOutFromVerify = async () => {
    setBusy(true)
    try {
      await signOutUser()
      setSignupSent(false)
    } catch (err) {
      setError(friendlyErr(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease }}
      className={cn(
        'flex h-full min-h-0 w-full max-h-full flex-1 items-start justify-center',
        'overflow-hidden',
        'px-4 sm:px-6',
        'pt-[max(env(safe-area-inset-top,0px),0.35rem)] sm:pt-[max(env(safe-area-inset-top,0px),clamp(1.25rem,8vh,5rem))]',
        'pb-[max(env(safe-area-inset-bottom,0px),clamp(0.75rem,3vh,2rem))]',
      )}
    >
      <div
        className={cn(
          'flex h-full min-h-0 w-full max-h-full max-w-[min(100%,24rem)] flex-col',
          'max-h-[min(100%,calc(100svh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1.75rem))] sm:max-h-[min(100%,calc(100svh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-clamp(3.25rem,11vh,5.5rem)))]',
          'overflow-y-auto overscroll-contain',
          '[scrollbar-gutter:stable]',
        )}
      >
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            opacity: { duration: 0.5, ease, delay: 0.1 },
            y: { duration: 0.5, ease, delay: 0.1 },
          }}
          className={cn(
            'flex w-full shrink-0 flex-col',
            'rounded-[1.2rem] sm:rounded-[1.4rem]',
            'border border-[color-mix(in_oklab,var(--ink)_8%,transparent)]',
            'bg-[color-mix(in_oklab,var(--bg)_62%,transparent)]',
            'backdrop-blur-[20px] backdrop-saturate-[120%]',
            'px-[clamp(1rem,3.5vw,2rem)] py-[clamp(0.85rem,2.5vh,1.75rem)]',
          )}
          style={{ WebkitBackdropFilter: 'blur(20px) saturate(1.2)' }}
          aria-label="Authentication"
        >
          <div className="mb-3 flex shrink-0 items-center justify-between gap-4 sm:mb-4">
            <p className="m-0 font-[family-name:var(--font-vogue)] text-[1.05rem] font-semibold italic uppercase tracking-[0.08em] text-[color-mix(in_oklab,var(--ink)_72%,transparent)] sm:text-[1.15rem]">
              Talti
            </p>
            <span className="font-[family-name:var(--font-sans)] text-[0.58rem] font-bold uppercase tracking-[0.18em] text-[color-mix(in_oklab,var(--ink)_24%,transparent)] sm:text-[0.6rem]">
              Studio
            </span>
          </div>
          <div className="mb-3 h-px shrink-0 bg-[color-mix(in_oklab,var(--ink)_7%,transparent)] sm:mb-[clamp(0.85rem,2.5vh,1.25rem)]" />

          {needsVerifyPanel ? (
            <div className="flex flex-col gap-4">
              <h1 className="m-0 font-[family-name:var(--font-vogue)] text-[clamp(1.35rem,1.1rem+2vw,1.95rem)] font-normal italic leading-[1] tracking-[-0.02em] text-[color-mix(in_oklab,var(--ink)_88%,transparent)]">
                Verify your email
              </h1>
              <p className="m-0 font-[family-name:var(--font-sans)] text-[0.74rem] leading-relaxed text-[color-mix(in_oklab,var(--ink)_42%,transparent)]">
                We sent a link to <strong className="font-semibold text-[color-mix(in_oklab,var(--ink)_72%,transparent)]">{user?.email}</strong>.
                After you tap the link, continue below. Google sign-in skips this step.
              </p>
              {(stateNeedsVerify || signupSent) && (
                <p
                  className={cn(
                    msgCls,
                    'border-emerald-500/25 bg-emerald-500/10 text-[color-mix(in_oklab,var(--ink)_78%,transparent)]',
                  )}
                >
                  {signupSent
                    ? 'Verification email sent. Check your inbox and spam folder.'
                    : 'Finish verifying your email to use the app.'}
                </p>
              )}
              {error ? (
                <p
                  role="alert"
                  className={cn(
                    msgCls,
                    'border-red-400/35 bg-red-500/12 text-red-100/90',
                  )}
                >
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={onVerifiedContinue}
                  className={cn(
                    'flex w-full items-center justify-center rounded-full border-0',
                    'bg-[color-mix(in_oklab,var(--ink)_88%,transparent)] px-6 py-2.5 sm:py-3',
                    'font-[family-name:var(--font-sans)] text-[0.68rem] font-bold uppercase tracking-[0.16em] sm:text-[0.7rem]',
                    '!text-[var(--bg)] hover:!text-[var(--bg)]',
                    'cursor-pointer transition-[background,transform,opacity] duration-200',
                    'hover:-translate-y-px hover:bg-[var(--ink)] active:scale-[0.99]',
                    busy && 'pointer-events-none opacity-70',
                  )}
                >
                  I’ve verified — continue
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onResend}
                  className={cn(
                    'w-full rounded-full border border-[color-mix(in_oklab,var(--ink)_14%,transparent)] bg-transparent py-2.5',
                    'font-[family-name:var(--font-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.14em]',
                    'text-[color-mix(in_oklab,var(--ink)_72%,transparent)]',
                    'transition-colors hover:border-[color-mix(in_oklab,var(--ink)_22%,transparent)] hover:text-[color-mix(in_oklab,var(--ink)_88%,transparent)]',
                    busy && 'pointer-events-none opacity-70',
                  )}
                >
                  Resend verification email
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onSignOutFromVerify}
                  className={cn(
                    'mt-1 w-full rounded-full border-0 bg-transparent py-2',
                    'font-[family-name:var(--font-sans)] text-[0.65rem] font-semibold uppercase tracking-[0.14em]',
                    'text-[color-mix(in_oklab,var(--ink)_38%,transparent)] hover:text-[color-mix(in_oklab,var(--ink)_58%,transparent)]',
                  )}
                >
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <motion.div
              variants={authFormVariants}
              initial="visible"
              animate={visible ? 'visible' : 'hidden'}
              className={cn('flex flex-col', !visible && 'pointer-events-none')}
            >
              <div className="mb-[clamp(0.75rem,2.5vh,1.25rem)]">
                <h1 className="m-0 font-[family-name:var(--font-vogue)] text-[clamp(1.35rem,1.1rem+2vw,1.95rem)] font-normal italic leading-[1] tracking-[-0.02em] text-[color-mix(in_oklab,var(--ink)_88%,transparent)]">
                  {rendered === 'signin' && resetMode
                    ? 'Reset password'
                    : rendered === 'signin'
                      ? 'Sign in'
                      : 'Create account'}
                </h1>
                <p className="m-0 mt-1.5 font-[family-name:var(--font-sans)] text-[0.72rem] text-[color-mix(in_oklab,var(--ink)_38%,transparent)] sm:mt-2 sm:text-[0.74rem]">
                  {rendered === 'signin' && resetMode
                    ? 'We will email you a link to choose a new password. Check spam if you do not see it.'
                    : rendered === 'signin'
                      ? 'Welcome back to your studio.'
                      : 'Start designing your custom pieces.'}
                </p>
              </div>

              {resetSuccess && rendered === 'signin' && resetMode ? (
                <p
                  className={cn(
                    msgCls,
                    'mb-4 border-emerald-500/25 bg-emerald-500/10 text-[color-mix(in_oklab,var(--ink)_78%,transparent)]',
                  )}
                >
                  If an account exists for that email, we sent reset instructions. You can close this
                  message and sign in once your password is updated.
                </p>
              ) : null}

              {signupSent && rendered === 'signup' ? (
                <p
                  className={cn(
                    msgCls,
                    'mb-4 border-emerald-500/25 bg-emerald-500/10 text-[color-mix(in_oklab,var(--ink)_78%,transparent)]',
                  )}
                >
                  Account created. Check your email to verify, then sign in. You can resend the email
                  from the verification screen if you stay signed in.
                </p>
              ) : null}

              {error ? (
                <p
                  role="alert"
                  className={cn(
                    msgCls,
                    'mb-4 border-red-400/35 bg-red-500/12 text-red-100/90',
                  )}
                >
                  {error}
                </p>
              ) : null}

              {!(rendered === 'signin' && resetMode && resetSuccess) ? (
              <div className="space-y-[clamp(0.65rem,1.75vh,1rem)]">
                {rendered === 'signup' && (
                  <label className="block">
                    <span className="mb-1.5 block font-[family-name:var(--font-sans)] text-[0.65rem] font-semibold uppercase tracking-[0.13em] text-[color-mix(in_oklab,var(--ink)_32%,transparent)]">
                      Full name
                    </span>
                    <input
                      type="text"
                      autoComplete="name"
                      placeholder="Alex Morgan"
                      className={inputCls}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </label>
                )}
                <label className="block">
                  <span className="mb-1.5 block font-[family-name:var(--font-sans)] text-[0.65rem] font-semibold uppercase tracking-[0.13em] text-[color-mix(in_oklab,var(--ink)_32%,transparent)]">
                    Email
                  </span>
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={inputCls}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={Boolean(rendered === 'signin' && resetMode && resetSuccess)}
                  />
                </label>
                {!(rendered === 'signin' && resetMode) && (
                  <label className="block">
                    <span className="mb-1.5 block font-[family-name:var(--font-sans)] text-[0.65rem] font-semibold uppercase tracking-[0.13em] text-[color-mix(in_oklab,var(--ink)_32%,transparent)]">
                      Password
                    </span>
                    <input
                      type="password"
                      autoComplete={rendered === 'signin' ? 'current-password' : 'new-password'}
                      placeholder="••••••••"
                      className={inputCls}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                )}
                {rendered === 'signin' && !resetMode && (
                  <div className="flex justify-end pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setResetMode(true)
                        setResetSuccess(false)
                        setError(null)
                      }}
                      className="font-[family-name:var(--font-sans)] text-[0.68rem] text-[color-mix(in_oklab,var(--ink)_38%,transparent)] transition-colors duration-150 hover:text-[color-mix(in_oklab,var(--ink)_72%,transparent)]"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </div>
              ) : null}

              {rendered === 'signin' && resetMode && resetSuccess ? (
                <button
                  type="button"
                  onClick={closePasswordReset}
                  className={cn(
                    'mt-[clamp(0.85rem,2.5vh,1.35rem)] flex w-full items-center justify-center rounded-full border-0',
                    'bg-[color-mix(in_oklab,var(--ink)_88%,transparent)] px-6 py-2.5 sm:py-3',
                    'font-[family-name:var(--font-sans)] text-[0.68rem] font-bold uppercase tracking-[0.16em] sm:text-[0.7rem]',
                    '!text-[var(--bg)] hover:!text-[var(--bg)]',
                    'cursor-pointer transition-[background,transform] duration-200',
                    'hover:-translate-y-px hover:bg-[var(--ink)] active:scale-[0.99]',
                  )}
                >
                  Back to sign in
                </button>
              ) : (
                <form onSubmit={onEmailSubmit}>
                  <button
                    type="submit"
                    disabled={busy}
                    className={cn(
                      'mt-[clamp(0.85rem,2.5vh,1.35rem)] flex w-full items-center justify-center rounded-full border-0',
                      'bg-[color-mix(in_oklab,var(--ink)_88%,transparent)] px-6 py-2.5 sm:py-3',
                      'font-[family-name:var(--font-sans)] text-[0.68rem] font-bold uppercase tracking-[0.16em] sm:text-[0.7rem]',
                      '!text-[var(--bg)] hover:!text-[var(--bg)]',
                      'cursor-pointer transition-[background,transform,opacity] duration-200',
                      'hover:-translate-y-px hover:bg-[var(--ink)] active:scale-[0.99]',
                      busy && 'pointer-events-none opacity-70',
                    )}
                  >
                    {rendered === 'signin' && resetMode
                      ? 'Send reset link'
                      : rendered === 'signin'
                        ? 'Sign in'
                        : 'Create account'}
                  </button>
                </form>
              )}

              {rendered === 'signin' && resetMode && !resetSuccess ? (
                <button
                  type="button"
                  onClick={closePasswordReset}
                  className="m-0 mx-auto mt-3 block border-0 bg-transparent p-0 font-[family-name:var(--font-sans)] text-[0.68rem] font-semibold text-[color-mix(in_oklab,var(--ink)_42%,transparent)] underline decoration-[color-mix(in_oklab,var(--ink)_18%,transparent)] underline-offset-[3px] transition-colors hover:text-[color-mix(in_oklab,var(--ink)_72%,transparent)]"
                >
                  Back to sign in
                </button>
              ) : null}

              {rendered === 'signin' && resetMode ? null : (
                <>
              <div className="my-[clamp(0.65rem,2vh,1.1rem)] flex items-center gap-3">
                <span className="h-px flex-1 bg-[color-mix(in_oklab,var(--ink)_7%,transparent)]" />
                <span className="font-[family-name:var(--font-sans)] text-[0.65rem] uppercase tracking-[0.14em] text-[color-mix(in_oklab,var(--ink)_28%,transparent)]">
                  or
                </span>
                <span className="h-px flex-1 bg-[color-mix(in_oklab,var(--ink)_7%,transparent)]" />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={onGoogle}
                className={cn(
                  'flex w-full items-center justify-center gap-3',
                  'h-10 rounded-[0.75rem] sm:h-11',
                  'border border-[color-mix(in_oklab,var(--ink)_10%,transparent)]',
                  'bg-[var(--field-bg)]',
                  'shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
                  'font-[family-name:var(--font-sans)] text-[0.72rem] font-semibold tracking-[0.04em] text-[color-mix(in_oklab,var(--ink)_72%,transparent)] sm:text-[0.75rem]',
                  'transition-[background,border-color,transform,box-shadow,opacity] duration-200',
                  'hover:bg-[var(--field-bg-focus)] hover:border-[color-mix(in_oklab,var(--ink)_18%,transparent)] hover:text-[color-mix(in_oklab,var(--ink)_88%,transparent)]',
                  'hover:-translate-y-px hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_8px_rgba(0,0,0,0.35)]',
                  'active:scale-[0.99] active:translate-y-0',
                  'cursor-pointer',
                  busy && 'pointer-events-none opacity-70',
                )}
              >
                <span className="flex shrink-0 items-center">
                  <GoogleIcon />
                </span>
                Continue with Google
              </button>
                </>
              )}

              {rendered === 'signin' && resetMode ? null : (
              <p className="m-0 mt-[clamp(0.65rem,2vh,1.1rem)] pb-0.5 text-center font-[family-name:var(--font-sans)] text-[0.7rem] text-[color-mix(in_oklab,var(--ink)_38%,transparent)] sm:text-[0.72rem]">
                {rendered === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
                <button
                  type="button"
                  onClick={() => switchMode(rendered === 'signin' ? 'signup' : 'signin')}
                  className={cn(
                    'border-0 bg-transparent p-0',
                    'font-[family-name:var(--font-sans)] text-[0.7rem] font-semibold text-[color-mix(in_oklab,var(--ink)_72%,transparent)] sm:text-[0.72rem]',
                    'cursor-pointer underline decoration-[color-mix(in_oklab,var(--ink)_18%,transparent)] underline-offset-[3px]',
                    'transition-colors duration-150 hover:text-[color-mix(in_oklab,var(--ink)_88%,transparent)] hover:decoration-[color-mix(in_oklab,var(--ink)_35%,transparent)]',
                  )}
                >
                  {rendered === 'signin' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
              )}
            </motion.div>
          )}
        </motion.section>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease, delay: 0.35 }}
          className="m-0 mt-[clamp(0.5rem,1.75vh,1rem)] shrink-0 text-center font-[family-name:var(--font-sans)] text-[0.6rem] leading-relaxed text-[color-mix(in_oklab,var(--ink)_28%,transparent)] sm:text-[0.62rem]"
        >
          By continuing you agree to our{' '}
          <span className="underline decoration-[color-mix(in_oklab,var(--ink)_15%,transparent)] underline-offset-[2px]">
            Terms
          </span>{' '}
          &amp;{' '}
          <span className="underline decoration-[color-mix(in_oklab,var(--ink)_15%,transparent)] underline-offset-[2px]">
            Privacy
          </span>
          .
        </motion.p>
      </div>
    </motion.div>
  )
}
