import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canAccessApp } from '../lib/authUtils'
import {
  removeCartLine,
  subscribeCartItems,
  updateCartLineQty,
} from '../lib/cartFirestore'
import type { CartItemRecord } from '../lib/firestoreTypes'

const ease = [0.22, 1, 0.36, 1] as const

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

const QtyButton = ({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  disabled: boolean
  label: string
  children: React.ReactNode
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className={cn(
      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-transparent',
      'sm:h-6 sm:w-6',
      'font-[family-name:var(--font-sans)] text-[1.1rem] leading-none sm:text-[1rem]',
      'text-[color-mix(in_oklab,var(--ink)_35%,transparent)] transition-colors duration-150',
      'hover:bg-[color-mix(in_oklab,var(--ink)_7%,transparent)] hover:text-[color-mix(in_oklab,var(--ink)_82%,transparent)] active:bg-[color-mix(in_oklab,var(--ink)_6%,transparent)]',
      'disabled:cursor-default disabled:opacity-25',
    )}
  >
    {children}
  </button>
)

export function CartPage() {
  const { user, ready } = useAuth()
  const [lines, setLines] = useState<CartItemRecord[]>([])
  const [cartError, setCartError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready || !user || !canAccessApp(user)) {
      setLines([])
      return
    }
    const unsub = subscribeCartItems(
      user.uid,
      (next) => {
        setLines(next)
        setCartError(null)
      },
      () => setCartError('Could not load your cart.'),
    )
    return () => unsub()
  }, [ready, user])

  const { subtotal, count } = useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + l.unitPrice * l.qty, 0)
    const count = lines.reduce((a, l) => a + l.qty, 0)
    return { subtotal, count }
  }, [lines])

  const setQty = (id: string, next: number) => {
    const q = Math.min(99, Math.max(1, next))
    if (!user || !canAccessApp(user)) return
    void updateCartLineQty(user.uid, id, q).catch(() =>
      setCartError('Could not update quantity.'),
    )
  }

  const removeLine = (id: string) => {
    if (!user || !canAccessApp(user)) return
    void removeCartLine(user.uid, id).catch(() =>
      setCartError('Could not remove item.'),
    )
  }

  const signedInVerified = Boolean(user && canAccessApp(user))

  return (
    <motion.main
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      className={cn(
        'flex min-h-0 w-full flex-1 flex-col overflow-hidden',
        'bg-transparent',
        'px-[max(0.5rem,min(3.5vw,1rem),env(safe-area-inset-left,0px))]',
        'pr-[max(0.5rem,min(3.5vw,1rem),env(safe-area-inset-right,0px))]',
        'pt-[max(0.25rem,min(1.5vh,0.75rem),env(safe-area-inset-top,0px))]',
        'pb-[max(0.35rem,min(2vh,1rem),env(safe-area-inset-bottom,0px))]',
        'sm:px-[clamp(0.85rem,3.2vw,1.75rem)] md:px-[clamp(1rem,4vw,2rem)]',
      )}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[min(100%,48.75rem)] flex-1 flex-col">
        <div
          className={cn(
            'flex min-h-0 w-full flex-1 flex-col overflow-hidden',
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
        {/* ── Top bar ── */}
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
              Your bag
            </p>
            <h1
              className={cn(
                'font-[family-name:var(--font-vogue)] font-normal italic',
                'text-[clamp(1.65rem,1.1rem+5.5vw,3.5rem)] leading-[0.95] tracking-[-0.02em]',
                ink.strong,
              )}
            >
              Cart
            </h1>
          </div>

          <Link
            to="/design"
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
            Continue designing
          </Link>
        </div>

        {cartError ? (
          <p
            className={cn(
              'mb-3 shrink-0 font-[family-name:var(--font-sans)] text-[0.8rem]',
              ink.muted,
            )}
          >
            {cartError}
          </p>
        ) : null}

        {!ready ? (
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col items-center justify-center px-1 py-10 text-center',
              'font-[family-name:var(--font-sans)] text-[0.85rem]',
              ink.faint,
            )}
          >
            Loading cart…
          </div>
        ) : !signedInVerified ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex min-h-0 flex-1 flex-col items-center justify-center px-1 py-8 text-center sm:px-2 sm:py-10"
          >
            <p
              className={cn(
                'mx-auto max-w-[min(100%,20rem)] font-[family-name:var(--font-sans)]',
                'text-[clamp(0.8rem,0.76rem+0.35vw,0.9rem)] leading-relaxed',
                ink.faint,
              )}
            >
              Sign in with a verified email to view your bag and checkout.
            </p>
            <Link
              to="/auth"
              className={cn(
                'mt-6 inline-flex min-h-11 w-full max-w-[16rem] items-center justify-center rounded-full no-underline sm:mt-8 sm:min-h-0 sm:w-auto sm:max-w-none',
                'bg-[color-mix(in_oklab,var(--ink)_88%,transparent)] px-8 py-3',
                'font-[family-name:var(--font-sans)] text-[clamp(0.62rem,0.6rem+0.15vw,0.7rem)] font-bold uppercase tracking-[0.16em] sm:tracking-[0.18em]',
                '!text-[var(--bg)] hover:!text-[var(--bg)]',
                'transition-[background,transform] duration-200',
                'hover:-translate-y-px hover:bg-[color-mix(in_oklab,var(--ink)_100%,transparent)]',
              )}
            >
              Sign in
            </Link>
          </motion.div>
        ) : lines.length === 0 ? (
          /* ── Empty state ── */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex min-h-0 flex-1 flex-col items-center justify-center px-1 py-8 text-center sm:px-2 sm:py-10"
          >
            <p
              className={cn(
                'mx-auto max-w-[min(100%,20rem)] font-[family-name:var(--font-sans)]',
                'text-[clamp(0.8rem,0.76rem+0.35vw,0.9rem)] leading-relaxed',
                ink.faint,
              )}
            >
              Nothing in your bag yet.
            </p>
            <Link
              to="/design"
              className={cn(
                'mt-6 inline-flex min-h-11 w-full max-w-[16rem] items-center justify-center rounded-full no-underline sm:mt-8 sm:min-h-0 sm:w-auto sm:max-w-none',
                'bg-[color-mix(in_oklab,var(--ink)_88%,transparent)] px-8 py-3',
                'font-[family-name:var(--font-sans)] text-[clamp(0.62rem,0.6rem+0.15vw,0.7rem)] font-bold uppercase tracking-[0.16em] sm:tracking-[0.18em]',
                '!text-[var(--bg)] hover:!text-[var(--bg)]',
                'transition-[background,transform] duration-200',
                'hover:-translate-y-px hover:bg-[color-mix(in_oklab,var(--ink)_100%,transparent)]',
              )}
            >
              Studio
            </Link>
          </motion.div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* ── Item count ── */}
            <div className="mb-2 flex shrink-0 items-center gap-2 sm:mb-3">
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
            </div>

            {/* ── Table header (tablet+) ── */}
            <div
              className={cn(
                'mb-0 hidden shrink-0 gap-x-2 sm:grid',
                'sm:grid-cols-[minmax(0,1fr)_5.5rem_5rem_3.75rem]',
                'md:grid-cols-[minmax(0,1fr)_6rem_5.5rem_4rem] md:gap-x-3',
                'border-b border-[color-mix(in_oklab,var(--ink)_8%,transparent)] pb-2',
                'font-[family-name:var(--font-sans)] text-[clamp(0.56rem,0.52rem+0.2vw,0.62rem)] font-bold uppercase tracking-[0.16em] sm:tracking-[0.18em]',
                ink.label,
              )}
            >
              <span>Item</span>
              <span className="text-center">Qty</span>
              <span className="text-right">Total</span>
              <span />
            </div>

            {/* ── Line items (scrolls only here if needed) ── */}
            <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto overscroll-contain p-0 [scrollbar-gutter:stable]">
              <AnimatePresence initial={false}>
                {lines.map((line, i) => (
                  <motion.li
                    key={line.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.35, ease, delay: i * 0.04 }}
                    className={cn(
                      'border-b border-[color-mix(in_oklab,var(--ink)_7%,transparent)] py-[clamp(0.75rem,2vw,1rem)]',
                      'sm:grid sm:grid-cols-[minmax(0,1fr)_5.5rem_5rem_3.75rem] sm:items-center sm:gap-x-2 sm:py-3.5',
                      'md:grid-cols-[minmax(0,1fr)_6rem_5.5rem_4rem] md:gap-x-3',
                    )}
                  >
                    {/* Info */}
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

                    {/* Mobile: one row for qty / total / remove; sm+: grid cells via contents */}
                    <div
                      className={cn(
                        'mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2',
                        'sm:mt-0 sm:contents',
                      )}
                    >
                      <div className="flex items-center gap-1 sm:flex sm:justify-center sm:gap-0">
                        <QtyButton
                          onClick={() => setQty(line.id, line.qty - 1)}
                          disabled={line.qty <= 1}
                          label="Decrease quantity"
                        >
                          −
                        </QtyButton>
                        <span
                          className={cn(
                            'min-w-[1.35rem] text-center font-mono text-[0.88rem] font-medium tabular-nums sm:min-w-[1.2rem] sm:text-[0.85rem]',
                            ink.strong,
                          )}
                        >
                          {line.qty}
                        </span>
                        <QtyButton
                          onClick={() => setQty(line.id, line.qty + 1)}
                          disabled={line.qty >= 99}
                          label="Increase quantity"
                        >
                          +
                        </QtyButton>
                      </div>

                      <p
                        className={cn(
                          'm-0 font-mono text-[0.9rem] font-medium tabular-nums sm:text-right sm:text-[0.88rem]',
                          ink.body,
                        )}
                      >
                        ${line.unitPrice * line.qty}
                      </p>

                      <div className="w-full sm:w-auto sm:text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className={cn(
                            '-m-1 border-0 bg-transparent p-2 font-[family-name:var(--font-sans)] sm:m-0 sm:p-0',
                            'text-[clamp(0.58rem,0.55rem+0.15vw,0.62rem)] font-bold uppercase tracking-[0.12em] sm:tracking-[0.14em]',
                            ink.faint,
                            'cursor-pointer transition-colors duration-150',
                            'hover:text-[rgba(160,40,30,0.75)]',
                          )}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>

            {/* ── Bottom: summary + CTA ── */}
            <div
              className={cn(
                'mt-3 shrink-0 border-t border-[color-mix(in_oklab,var(--ink)_6%,transparent)] pt-3 sm:mt-4 sm:pt-4',
                'grid grid-cols-1 items-stretch gap-4',
                'min-[520px]:grid-cols-[1fr_auto] min-[520px]:items-end min-[520px]:gap-5 md:gap-6',
              )}
            >
              {/* Summary */}
              <div>
                <div className="flex flex-col gap-1.5 pt-0 sm:gap-2">
                  {/* Subtotal */}
                  <div className="flex items-baseline justify-between gap-4 min-[380px]:gap-8">
                    <span
                      className={cn(
                        'font-[family-name:var(--font-sans)]',
                        'text-[clamp(0.66rem,0.62rem+0.2vw,0.74rem)] font-bold uppercase tracking-[0.12em] sm:tracking-[0.14em]',
                        ink.label,
                      )}
                    >
                      Subtotal
                    </span>
                    <span
                      className={cn(
                        'font-mono tabular-nums text-[clamp(0.74rem,0.7rem+0.15vw,0.82rem)]',
                        ink.muted,
                      )}
                    >
                      ${subtotal}
                    </span>
                  </div>
                  {/* Shipping */}
                  <div className="flex items-baseline justify-between gap-4 min-[380px]:gap-8">
                    <span
                      className={cn(
                        'font-[family-name:var(--font-sans)]',
                        'text-[clamp(0.66rem,0.62rem+0.2vw,0.74rem)] font-bold uppercase tracking-[0.12em] sm:tracking-[0.14em]',
                        ink.label,
                      )}
                    >
                      Shipping
                    </span>
                    <span
                      className={cn(
                        'text-right font-[family-name:var(--font-sans)]',
                        'text-[clamp(0.64rem,0.6rem+0.18vw,0.7rem)] uppercase tracking-[0.08em] sm:tracking-[0.1em]',
                        ink.faint,
                      )}
                    >
                      At checkout
                    </span>
                  </div>
                  {/* Tax */}
                  <div className="flex items-baseline justify-between gap-4 min-[380px]:gap-8">
                    <span
                      className={cn(
                        'font-[family-name:var(--font-sans)]',
                        'text-[clamp(0.66rem,0.62rem+0.2vw,0.74rem)] font-bold uppercase tracking-[0.12em] sm:tracking-[0.14em]',
                        ink.label,
                      )}
                    >
                      Tax
                    </span>
                    <span
                      className={cn(
                        'text-right font-[family-name:var(--font-sans)]',
                        'text-[clamp(0.64rem,0.6rem+0.18vw,0.7rem)] uppercase tracking-[0.08em] sm:tracking-[0.1em]',
                        ink.faint,
                      )}
                    >
                      At checkout
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div className="my-2 h-px bg-[color-mix(in_oklab,var(--ink)_7%,transparent)] sm:my-2.5" />

                {/* Total */}
                <div className="flex items-baseline justify-between gap-4 pt-1 min-[380px]:gap-8">
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
                    ${subtotal}
                  </span>
                </div>
              </div>

              {/* CTA */}
              <div className="flex flex-col items-stretch gap-2 min-[520px]:items-end min-[520px]:gap-2.5">
                <Link
                  to="/checkout"
                  className={cn(
                    'flex min-h-12 items-center justify-center rounded-full no-underline sm:min-h-0',
                    'w-full min-[520px]:w-auto',
                    'bg-[color-mix(in_oklab,var(--ink)_88%,transparent)] px-8 py-3 sm:px-10 sm:py-3',
                    'font-[family-name:var(--font-sans)]',
                    'text-[clamp(0.62rem,0.58rem+0.2vw,0.7rem)] font-bold uppercase tracking-[0.15em] sm:tracking-[0.18em]',
                    '!text-[var(--bg)] hover:!text-[var(--bg)]',
                    'transition-[background,transform] duration-200',
                    'hover:-translate-y-px hover:bg-[color-mix(in_oklab,var(--ink)_100%,transparent)] active:scale-[0.99]',
                  )}
                >
                  Checkout
                </Link>
                <p
                  className={cn(
                    'm-0 font-[family-name:var(--font-sans)] leading-relaxed tracking-[0.03em]',
                    'text-[clamp(0.6rem,0.58rem+0.15vw,0.66rem)]',
                    'text-center min-[520px]:text-right',
                    ink.faint,
                  )}
                >
                  Shipping &amp; tax finalized at checkout.
                </p>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </motion.main>
  )
}