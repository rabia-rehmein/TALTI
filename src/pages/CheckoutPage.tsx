import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { Banknote, CheckCircle2, Sparkles } from 'lucide-react'
import { doc, onSnapshot } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { canAccessApp } from '../lib/authUtils'
import { clearCartForUser, subscribeCartItems } from '../lib/cartFirestore'
import { db } from '../lib/firebase'
import type { CartItemRecord, ShippingAddress } from '../lib/firestoreTypes'
import { emptyShippingAddress } from '../lib/firestoreTypes'
import { createUserOrder } from '../lib/ordersFirestore'
import type { UserProfile } from '../lib/userProfile'

const ease = [0.22, 1, 0.36, 1] as const

const contentStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
} as const

const fadeUpItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } },
} as const

const ink = {
  strong: 'text-[color-mix(in_oklab,var(--ink)_88%,transparent)]',
  body: 'text-[color-mix(in_oklab,var(--ink)_72%,transparent)]',
  muted: 'text-[color-mix(in_oklab,var(--ink)_52%,transparent)]',
  faint: 'text-[color-mix(in_oklab,var(--ink)_36%,transparent)]',
  label: 'text-[color-mix(in_oklab,var(--ink)_28%,transparent)]',
} as const

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ')
}

const inputClass = cn(
  'w-full rounded-[0.55rem] border border-[color-mix(in_oklab,var(--ink)_12%,transparent)] bg-[var(--field-bg)]',
  'px-3 py-2.5 font-[family-name:var(--font-sans)]',
  'text-[clamp(0.78rem,0.74rem+0.2vw,0.88rem)] text-[color-mix(in_oklab,var(--ink)_82%,transparent)] outline-none',
  'transition-[border-color,box-shadow,background] duration-150',
  'placeholder:text-[color-mix(in_oklab,var(--ink)_28%,transparent)]',
  'focus:border-[color-mix(in_oklab,var(--ink)_26%,transparent)] focus:bg-[var(--field-bg-focus)]',
  'focus:shadow-[0_0_0_3px_rgba(255,255,255,0.08)]',
)

const sectionTitle = cn(
  'mb-2.5 font-[family-name:var(--font-sans)] sm:mb-3',
  'text-[clamp(0.56rem,0.52rem+0.2vw,0.62rem)] font-bold uppercase tracking-[0.16em] sm:tracking-[0.18em]',
  ink.label,
)

const SHIPPING_FLAT = 12
const TAX_RATE = 0.0825

const emptyCartLines: CartItemRecord[] = []

export function CheckoutPage() {
  const navigate = useNavigate()
  const { user, ready } = useAuth()
  const [remoteCart, setRemoteCart] = useState<{
    uid: string | null
    lines: CartItemRecord[]
    hydrated: boolean
    error: string | null
  }>({
    uid: null,
    lines: [],
    hydrated: false,
    error: null,
  })
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [shipping, setShipping] = useState<ShippingAddress>(() => emptyShippingAddress())
  const profilePrefilled = useRef(false)

  useEffect(() => {
    profilePrefilled.current = false
  }, [user?.uid])

  const [placing, setPlacing] = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [orderSuccess, setOrderSuccess] = useState<{
    orderNumber: string
    total: number
    itemCount: number
  } | null>(null)

  const signedInVerified = Boolean(user && canAccessApp(user))

  const cartSessionUid =
    ready && user && canAccessApp(user) ? user.uid : null

  const cartForSession =
    cartSessionUid != null && remoteCart.uid === cartSessionUid
      ? remoteCart
      : null

  const cartLines = useMemo(() => {
    if (cartForSession != null) return cartForSession.lines
    return emptyCartLines
  }, [cartForSession])
  const cartError = cartForSession?.error ?? null
  const cartHydrated = Boolean(
    cartSessionUid != null && cartForSession != null && cartForSession.hydrated,
  )

  useEffect(() => {
    if (!ready || !user || !canAccessApp(user)) {
      return
    }
    const uid = user.uid
    return subscribeCartItems(
      uid,
      (next) => {
        setRemoteCart({
          uid,
          lines: next,
          hydrated: true,
          error: null,
        })
      },
      () => {
        setRemoteCart({
          uid,
          lines: [],
          hydrated: true,
          error: 'Could not load your bag.',
        })
      },
    )
  }, [ready, user])

  useEffect(() => {
    if (!user?.uid || !canAccessApp(user)) return
    const ref = doc(db, 'users', user.uid)
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists() || profilePrefilled.current) return
      const p = snap.data() as UserProfile
      setEmail(p.email || user.email || '')
      setFullName(p.displayName?.trim() || user.displayName?.trim() || '')
      if (p.shippingAddress) {
        setShipping({
          ...emptyShippingAddress(),
          ...p.shippingAddress,
        })
      }
      profilePrefilled.current = true
    })
    return unsub
  }, [user])

  const { subtotal, count } = useMemo(() => {
    const subtotal = cartLines.reduce((a, l) => a + l.unitPrice * l.qty, 0)
    const count = cartLines.reduce((a, l) => a + l.qty, 0)
    return { subtotal, count }
  }, [cartLines])

  const tax = Math.round(subtotal * TAX_RATE)
  const total = subtotal + SHIPPING_FLAT + tax

  const patchShipping = (patch: Partial<ShippingAddress>) => {
    setShipping((s) => ({ ...s, ...patch }))
  }

  const checkoutEnabled =
    signedInVerified &&
    cartLines.length > 0 &&
    !placing &&
    email.includes('@') &&
    fullName.trim().length > 0 &&
    shipping.line1.trim().length > 0 &&
    shipping.city.trim().length > 0 &&
    shipping.postalCode.trim().length > 0

  const placeOrder = async () => {
    if (!user || !canAccessApp(user) || cartLines.length === 0) return
    setPlacing(true)
    setPlaceError(null)
    const orderNumber = `TL-${Date.now().toString(36).toUpperCase()}`
    const snapShipping: ShippingAddress = {
      line1: shipping.line1.trim(),
      line2: shipping.line2.trim(),
      city: shipping.city.trim(),
      region: shipping.region.trim(),
      postalCode: shipping.postalCode.trim(),
      country: shipping.country.trim() || 'US',
    }
    const items = cartLines.map((l) => ({
      name: `${l.title} — ${l.variant}`,
      title: l.title,
      quantity: l.qty,
      unitPrice: l.unitPrice,
      sku: l.sku,
      garmentId: l.garmentId,
      size: l.size,
      variant: l.variant,
      glbPath: l.glbPath,
    }))
    const merchandiseSub = cartLines.reduce(
      (a, l) => a + l.unitPrice * l.qty,
      0,
    )
    const notes = `COD · Est. shipping $${SHIPPING_FLAT} · Est. tax $${tax} · Est. total $${total} · ${count} item(s)`

    try {
      await createUserOrder(user.uid, {
        orderNumber,
        items,
        subtotal: merchandiseSub,
        currency: 'USD',
        shippingAddressSnapshot: snapShipping,
        notes,
        status: 'pending',
        customerEmail: email.trim(),
        customerName: fullName.trim(),
        shippingFee: SHIPPING_FLAT,
        taxEstimated: tax,
        orderTotal: total,
      })
      await clearCartForUser(user.uid)
      setOrderSuccess({
        orderNumber,
        total,
        itemCount: count,
      })
    } catch {
      setPlaceError('We could not place your order. Please try again.')
    } finally {
      setPlacing(false)
    }
  }

  const sectionShell = cn(
    'rounded-[0.75rem] border border-[color-mix(in_oklab,var(--ink)_10%,transparent)]',
    'bg-[var(--field-bg)] p-[clamp(0.75rem,2.2vw,1rem)] sm:p-4',
  )

  const continueShopping = () => {
    setOrderSuccess(null)
    navigate('/design')
  }

  const goProfile = () => {
    setOrderSuccess(null)
    navigate('/profile')
  }

  return (
    <motion.main
      initial={false}
      className={cn(
        'relative flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto',
        'bg-transparent',
        'px-[max(0.5rem,min(3.5vw,1rem),env(safe-area-inset-left,0px))]',
        'pr-[max(0.5rem,min(3.5vw,1rem),env(safe-area-inset-right,0px))]',
        'pt-[max(0.25rem,min(1.5vh,0.75rem),env(safe-area-inset-top,0px))]',
        'pb-[max(0.35rem,min(2vh,1rem),env(safe-area-inset-bottom,0px))]',
        'sm:px-[clamp(0.85rem,3.2vw,1.75rem)] md:px-[clamp(1rem,4vw,2rem)]',
      )}
    >
      <AnimatePresence>
        {orderSuccess ? (
          <motion.div
            key="order-success"
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.38, ease }}
          >
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-[color-mix(in_oklab,var(--ink)_38%,transparent)] backdrop-blur-[10px] backdrop-saturate-125"
              style={{ WebkitBackdropFilter: 'blur(10px) saturate(1.25)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="order-placed-title"
              className={cn(
                'relative z-10 w-full max-w-[min(100%,22rem)] overflow-hidden rounded-2xl text-center',
                'border border-[color-mix(in_oklab,var(--ink)_12%,transparent)]',
                'bg-[color-mix(in_oklab,var(--bg-elevated)_55%,transparent)]',
                'shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55),inset_0_1px_0_color-mix(in_oklab,var(--ink)_10%,transparent)]',
                'backdrop-blur-xl backdrop-saturate-150 px-6 py-8 sm:px-8 sm:py-9',
              )}
              style={{ WebkitBackdropFilter: 'blur(18px) saturate(1.5)' }}
              initial={{ opacity: 0, scale: 0.9, y: 32 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            >
              <motion.div
                className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--ink)_8%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--ink)_14%,transparent)]"
                initial={{ scale: 0, rotate: -25 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 320,
                  damping: 22,
                  delay: 0.08,
                }}
              >
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 20,
                    delay: 0.22,
                  }}
                >
                  <CheckCircle2
                    className="size-9 text-[color-mix(in_oklab,var(--ink)_72%,transparent)]"
                    strokeWidth={1.65}
                    aria-hidden
                  />
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.45, ease }}
              >
                <p
                  className={cn(
                    'mb-2 flex items-center justify-center gap-1.5 font-[family-name:var(--font-sans)]',
                    'text-[0.62rem] font-bold uppercase tracking-[0.22em]',
                    ink.muted,
                  )}
                >
                  <Sparkles className="size-3 opacity-80" strokeWidth={2} aria-hidden />
                  Thank you
                </p>
                <h2
                  id="order-placed-title"
                  className={cn(
                    'm-0 font-[family-name:var(--font-vogue)] font-semibold italic',
                    'text-[clamp(1.45rem,1rem+4vw,2rem)] leading-tight tracking-[0.04em]',
                    ink.strong,
                  )}
                >
                  Order placed
                </h2>
                <p
                  className={cn(
                    'mx-auto mt-3 max-w-[18rem] font-[family-name:var(--font-sans)]',
                    'text-[0.82rem] leading-relaxed',
                    ink.faint,
                  )}
                >
                  Your tailoring request is in. We will follow up when your pieces move
                  into production.
                </p>
                <div className="mt-6 space-y-1.5 rounded-xl bg-[color-mix(in_oklab,var(--ink)_5%,transparent)] py-4 ring-1 ring-inset ring-[color-mix(in_oklab,var(--ink)_8%,transparent)]">
                  <p
                    className={cn(
                      'm-0 font-mono text-[0.72rem] uppercase tracking-[0.14em]',
                      ink.label,
                    )}
                  >
                    Confirmation
                  </p>
                  <p
                    className={cn(
                      'm-0 font-mono text-[0.95rem] font-medium tabular-nums tracking-tight',
                      ink.strong,
                    )}
                  >
                    {orderSuccess.orderNumber}
                  </p>
                  <p
                    className={cn(
                      'm-0 mt-2 font-[family-name:var(--font-sans)] text-[0.72rem]',
                      ink.muted,
                    )}
                  >
                    {orderSuccess.itemCount}{' '}
                    {orderSuccess.itemCount === 1 ? 'item' : 'items'} ·{' '}
                    <span className="font-mono tabular-nums text-[color-mix(in_oklab,var(--ink)_78%,transparent)]">
                      ${orderSuccess.total}
                    </span>{' '}
                    est. total
                  </p>
                </div>
              </motion.div>

              <motion.div
                className="mt-7 flex flex-col gap-2.5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.4, ease }}
              >
                <button
                  type="button"
                  onClick={continueShopping}
                  className={cn(
                    'w-full cursor-pointer rounded-full border-0 px-6 py-3',
                    'bg-[color-mix(in_oklab,var(--ink)_88%,transparent)]',
                    'font-[family-name:var(--font-sans)] text-[0.65rem] font-bold uppercase tracking-[0.18em]',
                    '!text-[var(--bg)]',
                    'transition-[background,transform] duration-200',
                    'hover:-translate-y-px hover:bg-[color-mix(in_oklab,var(--ink)_100%,transparent)]',
                  )}
                >
                  Continue designing
                </button>
                <button
                  type="button"
                  onClick={goProfile}
                  className={cn(
                    'w-full cursor-pointer rounded-full border border-[color-mix(in_oklab,var(--ink)_18%,transparent)] bg-transparent px-6 py-3',
                    'font-[family-name:var(--font-sans)] text-[0.65rem] font-bold uppercase tracking-[0.16em]',
                    ink.body,
                    'transition-[background,border-color] duration-200',
                    'hover:bg-[color-mix(in_oklab,var(--ink)_6%,transparent)]',
                  )}
                >
                  View account
                </button>
              </motion.div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="mx-auto flex min-h-0 w-full max-w-[min(100%,48.75rem)] flex-1 flex-col">
        <div
          className={cn(
            'flex w-full flex-col',
            'rounded-[0.95rem] border border-[color-mix(in_oklab,var(--ink)_9%,transparent)]',
            'sm:rounded-[1.2rem] md:rounded-[1.35rem]',
            'bg-[color-mix(in_oklab,var(--bg)_58%,transparent)]',
            'shadow-[var(--shadow-card)]',
            'p-[clamp(0.65rem,2.8vw,1rem)]',
            'sm:p-[clamp(0.85rem,2.5vw,1.15rem)] md:p-5 lg:p-6',
            'backdrop-blur-[14px] backdrop-saturate-[115%]',
          )}
          style={{ WebkitBackdropFilter: 'blur(14px) saturate(1.15)' }}
        >
          <div
            className={cn(
              'mb-2 flex shrink-0 flex-col gap-3',
              'min-[400px]:flex-row min-[400px]:items-end min-[400px]:justify-between',
              'sm:mb-3',
            )}
          >
            <div className="min-w-0">
              <p
                className={cn(
                  'mb-1 font-[family-name:var(--font-sans)] sm:mb-1.5',
                  'text-[clamp(0.58rem,0.5rem+0.35vw,0.64rem)] font-bold uppercase tracking-[0.18em] sm:tracking-[0.22em]',
                  ink.label,
                )}
              >
                Secure checkout
              </p>
              <h1
                className={cn(
                  'font-[family-name:var(--font-vogue)] font-normal italic',
                  'text-[clamp(1.65rem,1.1rem+5.5vw,3.5rem)] leading-[0.95] tracking-[-0.02em]',
                  ink.strong,
                )}
              >
                Checkout
              </h1>
            </div>

            <Link
              to="/cart"
              className={cn(
                'inline-flex shrink-0 self-start font-[family-name:var(--font-sans)]',
                'min-[400px]:self-auto',
                'text-[clamp(0.62rem,0.58rem+0.2vw,0.72rem)] font-bold uppercase tracking-[0.14em] sm:tracking-[0.16em]',
                ink.muted,
                'border-b border-[color-mix(in_oklab,var(--ink)_10%,transparent)] pb-0.5',
                'transition-colors duration-200',
                'hover:border-[color-mix(in_oklab,var(--ink)_30%,transparent)] hover:text-[color-mix(in_oklab,var(--ink)_88%,transparent)]',
                'no-underline',
              )}
            >
              Back to bag
            </Link>
          </div>

          {(() => {
            if (!ready) {
              return (
                <div
                  className={cn(
                    'flex min-h-[12rem] flex-1 items-center justify-center font-[family-name:var(--font-sans)] text-[0.88rem]',
                    ink.faint,
                  )}
                >
                  Loading…
                </div>
              )
            }
            if (!signedInVerified) {
              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease }}
                  className="flex min-h-[14rem] flex-1 flex-col items-center justify-center px-2 text-center"
                >
                  <p className={cn('m-0 max-w-[20rem] text-[0.9rem] leading-relaxed', ink.faint)}>
                    Sign in with a verified email to checkout and place orders.
                  </p>
                  <Link
                    to="/auth"
                    className={cn(
                      'mt-6 inline-flex rounded-full px-8 py-3 no-underline',
                      'bg-[color-mix(in_oklab,var(--ink)_88%,transparent)]',
                      'font-[family-name:var(--font-sans)] text-[0.65rem] font-bold uppercase tracking-[0.16em]',
                      '!text-[var(--bg)]',
                    )}
                  >
                    Sign in
                  </Link>
                </motion.div>
              )
            }
            if (cartError) {
              return (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease }}
                  className="flex min-h-[14rem] flex-1 flex-col items-center justify-center px-2 text-center"
                >
                  <p className={cn('m-0 max-w-[24rem] text-[0.9rem] leading-relaxed', ink.muted)}>
                    {cartError}
                  </p>
                  <Link
                    to="/cart"
                    className={cn(
                      'mt-6 inline-flex rounded-full px-8 py-3 no-underline',
                      'bg-[color-mix(in_oklab,var(--ink)_88%,transparent)]',
                      'font-[family-name:var(--font-sans)] text-[0.65rem] font-bold uppercase tracking-[0.16em]',
                      '!text-[var(--bg)]',
                    )}
                  >
                    Back to bag
                  </Link>
                </motion.div>
              )
            }
            if (!cartHydrated) {
              return (
                <div
                  className={cn(
                    'flex min-h-[14rem] flex-1 items-center justify-center font-[family-name:var(--font-sans)] text-[0.88rem]',
                    ink.faint,
                  )}
                >
                  Loading your bag…
                </div>
              )
            }
            if (orderSuccess != null) {
              return (
                <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center px-4">
                  <p className={cn('sr-only', ink.faint)}>
                    Order {orderSuccess.orderNumber} confirmed. Totals were shown in the dialog.
                  </p>
                  <p className={cn('text-center text-[0.8rem]', ink.muted)}>
                    Order confirmed — use the dialog to continue.
                  </p>
                </div>
              )
            }
            if (cartLines.length === 0) {
              return (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease }}
                  className="flex min-h-[14rem] flex-1 flex-col items-center justify-center px-2 text-center"
                >
                  <p className={cn('m-0 max-w-[20rem] text-[0.9rem] leading-relaxed', ink.faint)}>
                    Your bag is empty. Add a design from the studio to check out.
                  </p>
                  <Link
                    to="/design"
                    className={cn(
                      'mt-6 inline-flex rounded-full px-8 py-3 no-underline',
                      'bg-[color-mix(in_oklab,var(--ink)_88%,transparent)]',
                      'font-[family-name:var(--font-sans)] text-[0.65rem] font-bold uppercase tracking-[0.16em]',
                      '!text-[var(--bg)]',
                    )}
                  >
                    Studio
                  </Link>
                </motion.div>
              )
            }
            return (
            <motion.div
              className="flex min-w-0 flex-col"
              variants={contentStagger}
              initial={false}
              animate="show"
            >
              <div className="min-w-0">
                <motion.div variants={fadeUpItem} className="mb-2 flex shrink-0 items-center gap-2 sm:mb-3">
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full',
                      'bg-[color-mix(in_oklab,var(--ink)_7%,transparent)]',
                      'font-[family-name:var(--font-sans)] text-[0.62rem] tabular-nums',
                      ink.muted,
                    )}
                  >
                    {count}
                  </span>
                  <span
                    className={cn(
                      'font-[family-name:var(--font-sans)] text-[0.65rem] font-bold uppercase tracking-[0.16em]',
                      ink.label,
                    )}
                  >
                    {count === 1 ? 'item' : 'items'}
                  </span>
                </motion.div>

                <motion.div variants={fadeUpItem}>
                  <div
                    className={cn(
                      'mb-1 hidden shrink-0 gap-x-2 sm:grid',
                      'sm:grid-cols-[minmax(0,1fr)_5rem]',
                      'md:grid-cols-[minmax(0,1fr)_5.5rem] md:gap-x-3',
                      'border-b border-[color-mix(in_oklab,var(--ink)_8%,transparent)] pb-2',
                      'font-[family-name:var(--font-sans)] text-[clamp(0.56rem,0.52rem+0.2vw,0.62rem)] font-bold uppercase tracking-[0.16em] sm:tracking-[0.18em]',
                      ink.label,
                    )}
                  >
                    <span>Item</span>
                    <span className="text-right">Total</span>
                  </div>

                  <ul className="m-0 list-none p-0">
                    {cartLines.map((line, i) => (
                      <motion.li
                        key={line.id}
                        layout
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.38, ease, delay: i * 0.045 }}
                        className={cn(
                          'border-b border-[color-mix(in_oklab,var(--ink)_7%,transparent)] py-[clamp(0.75rem,2vw,1rem)]',
                          'sm:grid sm:grid-cols-[minmax(0,1fr)_5rem] sm:items-center sm:gap-x-2 sm:py-3.5',
                          'md:grid-cols-[minmax(0,1fr)_5.5rem] md:gap-x-3',
                        )}
                      >
                        <div className="min-w-0">
                          <p
                            className={cn(
                              'm-0 font-[family-name:var(--font-sans)]',
                              'text-[clamp(0.82rem,0.78rem+0.25vw,0.92rem)] font-semibold leading-snug tracking-[-0.01em]',
                              ink.strong,
                            )}
                          >
                            {line.title}
                          </p>
                          <p
                            className={cn(
                              'm-0 mt-1 font-[family-name:var(--font-sans)]',
                              'text-[clamp(0.68rem,0.66rem+0.15vw,0.74rem)] leading-snug',
                              ink.faint,
                            )}
                          >
                            {line.variant}
                            <span className="text-[color-mix(in_oklab,var(--ink)_30%,transparent)]">
                              {' '}
                              · Qty {line.qty}
                            </span>
                          </p>
                          <p
                            className={cn(
                              'm-0 mt-1 font-mono tabular-nums',
                              'text-[clamp(0.64rem,0.62rem+0.1vw,0.7rem)] text-[color-mix(in_oklab,var(--ink)_22%,transparent)]',
                            )}
                          >
                            ${line.unitPrice} each
                          </p>
                        </div>
                        <p
                          className={cn(
                            'm-0 mt-3 font-mono text-[0.9rem] font-medium tabular-nums sm:mt-0 sm:text-right sm:text-[0.88rem]',
                            ink.body,
                          )}
                        >
                          ${line.unitPrice * line.qty}
                        </p>
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>

                <motion.div variants={fadeUpItem} className="mt-4 space-y-4 sm:mt-5 sm:space-y-5">
                  <section className={sectionShell} aria-label="Contact">
                    <h2 className={sectionTitle}>Contact</h2>
                    <label className="block">
                      <span className="sr-only">Email</span>
                      <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputClass}
                        placeholder="Email"
                      />
                    </label>
                  </section>

                  <section className={sectionShell} aria-label="Shipping">
                    <h2 className={sectionTitle}>Ship to</h2>
                    <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
                      <label className="block min-[480px]:col-span-2">
                        <span className="sr-only">Full name</span>
                        <input
                          type="text"
                          autoComplete="name"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className={inputClass}
                          placeholder="Full name"
                        />
                      </label>
                      <label className="block min-[480px]:col-span-2">
                        <span className="sr-only">Address line 1</span>
                        <input
                          type="text"
                          autoComplete="address-line1"
                          value={shipping.line1}
                          onChange={(e) => patchShipping({ line1: e.target.value })}
                          className={inputClass}
                          placeholder="Address"
                        />
                      </label>
                      <label className="block min-[480px]:col-span-2">
                        <span className="sr-only">Address line 2</span>
                        <input
                          type="text"
                          autoComplete="address-line2"
                          value={shipping.line2}
                          onChange={(e) => patchShipping({ line2: e.target.value })}
                          className={inputClass}
                          placeholder="Apt, suite (optional)"
                        />
                      </label>
                      <label className="block">
                        <span className="sr-only">City</span>
                        <input
                          type="text"
                          autoComplete="address-level2"
                          value={shipping.city}
                          onChange={(e) => patchShipping({ city: e.target.value })}
                          className={inputClass}
                          placeholder="City"
                        />
                      </label>
                      <label className="block">
                        <span className="sr-only">Region / State</span>
                        <input
                          type="text"
                          autoComplete="address-level1"
                          value={shipping.region}
                          onChange={(e) => patchShipping({ region: e.target.value })}
                          className={inputClass}
                          placeholder="State / region"
                        />
                      </label>
                      <label className="block">
                        <span className="sr-only">Postal code</span>
                        <input
                          type="text"
                          autoComplete="postal-code"
                          value={shipping.postalCode}
                          onChange={(e) => patchShipping({ postalCode: e.target.value })}
                          className={inputClass}
                          placeholder="ZIP / postal"
                        />
                      </label>
                      <label className="block">
                        <span className="sr-only">Country</span>
                        <input
                          type="text"
                          autoComplete="country-name"
                          value={shipping.country}
                          onChange={(e) => patchShipping({ country: e.target.value })}
                          className={inputClass}
                          placeholder="Country"
                        />
                      </label>
                    </div>
                    <p
                      className={cn(
                        'm-0 mt-3 font-[family-name:var(--font-sans)]',
                        'text-[clamp(0.64rem,0.6rem+0.15vw,0.7rem)] leading-snug',
                        ink.faint,
                      )}
                    >
                      Standard · 7–14 business days
                    </p>
                  </section>

                  <motion.section
                    variants={fadeUpItem}
                    className={sectionShell}
                    aria-label="Payment"
                  >
                    <h2 className={sectionTitle}>Payment</h2>
                    <div
                      className={cn(
                        'flex items-start gap-3 rounded-[0.65rem] border border-[color-mix(in_oklab,var(--ink)_12%,transparent)]',
                        'bg-[var(--field-bg)] p-3 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--ink)_7%,transparent)] sm:gap-3.5 sm:p-3.5',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.5rem] sm:h-11 sm:w-11',
                          'bg-[color-mix(in_oklab,var(--ink)_6%,transparent)] text-[color-mix(in_oklab,var(--ink)_55%,transparent)]',
                        )}
                        aria-hidden
                      >
                        <Banknote
                          className="h-[1.15rem] w-[1.15rem] sm:h-5 sm:w-5"
                          strokeWidth={1.75}
                        />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p
                          className={cn(
                            'm-0 font-[family-name:var(--font-sans)]',
                            'text-[clamp(0.82rem,0.78rem+0.2vw,0.9rem)] font-semibold leading-snug tracking-[-0.01em]',
                            ink.strong,
                          )}
                        >
                          Cash on delivery{' '}
                          <abbr title="Cash on delivery" className="no-underline">
                            (COD)
                          </abbr>
                        </p>
                        <p
                          className={cn(
                            'm-0 mt-1.5 font-[family-name:var(--font-sans)] leading-snug',
                            'text-[clamp(0.68rem,0.64rem+0.15vw,0.74rem)]',
                            ink.faint,
                          )}
                        >
                          Pay in cash when your order arrives.
                        </p>
                      </div>
                    </div>
                  </motion.section>
                </motion.div>
              </div>

              <motion.div
                variants={fadeUpItem}
                className={cn(
                  'mt-3 shrink-0 border-t border-[color-mix(in_oklab,var(--ink)_6%,transparent)] pt-3 sm:mt-4 sm:pt-4',
                  'grid grid-cols-1 items-stretch gap-4',
                  'min-[520px]:grid-cols-[1fr_auto] min-[520px]:items-end min-[520px]:gap-5 md:gap-6',
                )}
              >
                <div>
                  <motion.div
                    className="flex flex-col gap-1.5 pt-0 sm:gap-2"
                    initial={false}
                    animate="show"
                    variants={{
                      hidden: {},
                      show: { transition: { staggerChildren: 0.05 } },
                    }}
                  >
                    {(
                      [
                        ['Subtotal', subtotal],
                        ['Shipping', SHIPPING_FLAT],
                        ['Est. tax', tax],
                      ] as const
                    ).map(([label, value]) => (
                      <motion.div
                        key={label}
                        variants={{
                          hidden: { opacity: 0, x: -6 },
                          show: { opacity: 1, x: 0, transition: { duration: 0.35, ease } },
                        }}
                        className="flex items-baseline justify-between gap-4 min-[380px]:gap-8"
                      >
                        <span
                          className={cn(
                            'font-[family-name:var(--font-sans)]',
                            'text-[clamp(0.66rem,0.62rem+0.2vw,0.74rem)] font-bold uppercase tracking-[0.12em] sm:tracking-[0.14em]',
                            ink.label,
                          )}
                        >
                          {label}
                        </span>
                        <span
                          className={cn(
                            'font-mono tabular-nums text-[clamp(0.74rem,0.7rem+0.15vw,0.82rem)]',
                            ink.muted,
                          )}
                        >
                          ${value}
                        </span>
                      </motion.div>
                    ))}
                  </motion.div>

                  <div className="my-2 h-px bg-[color-mix(in_oklab,var(--ink)_7%,transparent)] sm:my-2.5" />

                  <motion.div
                    className="flex items-baseline justify-between gap-4 pt-1 min-[380px]:gap-8"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.4, ease }}
                  >
                    <span
                      className={cn(
                        'font-[family-name:var(--font-sans)]',
                        'text-[clamp(0.62rem,0.58rem+0.2vw,0.68rem)] font-bold uppercase tracking-[0.16em] sm:tracking-[0.2em]',
                        ink.label,
                      )}
                    >
                      Total
                    </span>
                    <span
                      className={cn(
                        'font-[family-name:var(--font-vogue)] font-normal italic',
                        'text-[clamp(1.35rem,0.9rem+3.5vw,2.1rem)] leading-none tracking-[-0.02em]',
                        ink.strong,
                      )}
                    >
                      ${total}
                    </span>
                  </motion.div>
                </div>

                <div className="flex flex-col items-stretch gap-2 min-[520px]:items-end min-[520px]:gap-2.5">
                  {placeError ? (
                    <p className={cn('m-0 text-[0.75rem]', ink.muted)}>{placeError}</p>
                  ) : null}
                  <motion.button
                    type="button"
                    disabled={!checkoutEnabled}
                    onClick={() => void placeOrder()}
                    whileTap={checkoutEnabled ? { scale: 0.99 } : undefined}
                    className={cn(
                      'flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border-0 sm:min-h-0',
                      'w-full min-[520px]:w-auto',
                      'bg-[color-mix(in_oklab,var(--ink)_88%,transparent)] px-8 py-3 sm:px-10 sm:py-3',
                      'font-[family-name:var(--font-sans)]',
                      'text-[clamp(0.62rem,0.58rem+0.2vw,0.7rem)] font-bold uppercase tracking-[0.15em] sm:tracking-[0.18em]',
                      '!text-[var(--bg)] hover:!text-[var(--bg)]',
                      'transition-[background,transform,opacity] duration-200',
                      'hover:-translate-y-px hover:bg-[color-mix(in_oklab,var(--ink)_100%,transparent)]',
                      !checkoutEnabled && 'cursor-not-allowed opacity-45 hover:translate-y-0',
                    )}
                  >
                    <Banknote
                      className="h-[0.95rem] w-[0.95rem] shrink-0 opacity-90 sm:h-4 sm:w-4"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <span>{placing ? 'Placing…' : `Place order · $${total}`}</span>
                  </motion.button>
                  <p
                    className={cn(
                      'm-0 font-[family-name:var(--font-sans)] leading-relaxed tracking-[0.03em]',
                      'text-[clamp(0.6rem,0.58rem+0.15vw,0.66rem)]',
                      'text-center min-[520px]:text-right',
                      ink.faint,
                    )}
                  >
                    Subtotal from your bag; shipping and tax are estimated for COD.
                  </p>
                </div>
              </motion.div>
            </motion.div>
            )
          })()}
        </div>
      </div>
    </motion.main>
  )
}
