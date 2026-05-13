import { FirebaseError } from 'firebase/app'
import { motion } from 'framer-motion'
import { Timestamp, doc, onSnapshot } from 'firebase/firestore'
import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../lib/firebase'
import { emptyShippingAddress } from '../lib/firestoreTypes'
import type { OrderRecord, OrderStatus, SavedDesignRecord, ShippingAddress } from '../lib/firestoreTypes'
import { formatAuthError } from '../lib/authErrors'
import {
  deleteUserOrder,
  mapOrderDoc,
  ordersForUserQuery,
  sortOrdersByCreatedAtDesc,
  updateUserOrder,
} from '../lib/ordersFirestore'
import {
  mapSavedDesignDoc,
  savedDesignsQuery,
} from '../lib/savedDesignsFirestore'
import type { UserProfile } from '../lib/userProfile'
import { linkGoogleToCurrentUser, signOutUser } from '../lib/authService'
import { canAccessApp, usesGoogleProvider, usesPasswordProvider } from '../lib/authUtils'
import { updateUserContactAndShipping } from '../lib/userProfileMutations'
import { cn } from '../lib/utils'

const ease = [0.22, 1, 0.36, 1] as const

const ink = {
  strong: 'text-[color-mix(in_oklab,var(--ink)_88%,transparent)]',
  body: 'text-[color-mix(in_oklab,var(--ink)_72%,transparent)]',
  muted: 'text-[color-mix(in_oklab,var(--ink)_52%,transparent)]',
  faint: 'text-[color-mix(in_oklab,var(--ink)_38%,transparent)]',
  label: 'text-[color-mix(in_oklab,var(--ink)_36%,transparent)]',
} as const

const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
]

function formatMemberSince(ts: unknown): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }
  return '—'
}

function formatFirestoreDate(ts: Timestamp | null): string {
  if (!ts) return '—'
  return ts.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function titleStatus(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

function formatOrderAddress(a: ShippingAddress): string {
  const line2 = a.line2?.trim()
  const cityRegion = [a.city, a.region].filter(Boolean).join(', ')
  const tail = [a.postalCode, a.country].filter(Boolean).join(' ')
  return [a.line1, line2, cityRegion, tail].filter(Boolean).join(' · ')
}

function statusTone(s: string) {
  const x = s.toLowerCase()
  if (x === 'shipped' || x === 'delivered') return ink.body
  if (x === 'processing' || x === 'pending') return ink.muted
  return ink.faint
}

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
}

const cardShell = cn(
  'rounded-2xl border border-[color-mix(in_oklab,var(--ink)_11%,transparent)]',
  'bg-[color-mix(in_oklab,var(--bg-elevated)_48%,transparent)]',
  'shadow-[0_10px_40px_rgba(0,0,0,0.35),inset_0_1px_0_color-mix(in_oklab,var(--ink)_9%,transparent)]',
  'backdrop-blur-[14px] backdrop-saturate-[125%]',
)

const hairline = 'border-[color-mix(in_oklab,var(--ink)_9%,transparent)]'

const fieldInput = cn(
  'mt-1 w-full rounded-lg border border-[color-mix(in_oklab,var(--ink)_12%,transparent)]',
  'bg-[color-mix(in_oklab,var(--bg)_40%,transparent)] px-3 py-2',
  'font-[family-name:var(--font-sans)] text-[0.82rem] text-[color-mix(in_oklab,var(--ink)_88%,transparent)]',
  'outline-none focus:border-[color-mix(in_oklab,var(--ink)_24%,transparent)]',
)

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} width="17" height="17" viewBox="0 0 18 18" aria-hidden fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.233 17.64 11.925 17.64 9.2z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  )
}

function shippingFromProfile(p: UserProfile | null) {
  if (p?.shippingAddress) return p.shippingAddress
  return emptyShippingAddress()
}

export function ProfilePage() {
  const { user, ready, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [designs, setDesigns] = useState<SavedDesignRecord[]>([])
  const [ordersErr, setOrdersErr] = useState<string | null>(null)
  const [designsErr, setDesignsErr] = useState<string | null>(null)

  const [linkBusy, setLinkBusy] = useState(false)
  const [linkNotice, setLinkNotice] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)

  const [editingProfile, setEditingProfile] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftPhone, setDraftPhone] = useState('')
  const [draftShip, setDraftShip] = useState(emptyShippingAddress())
  const [profileSaveBusy, setProfileSaveBusy] = useState(false)
  const [profileSaveNotice, setProfileSaveNotice] = useState<string | null>(null)

  const [contactPhoneBusy, setContactPhoneBusy] = useState(false)
  const [editingPhoneContact, setEditingPhoneContact] = useState(false)
  const [contactPhoneDraft, setContactPhoneDraft] = useState('')
  const [contactPhoneNotice, setContactPhoneNotice] = useState<string | null>(null)

  const openEditProfile = useCallback(() => {
    if (!user) return
    setDraftName(profile?.displayName?.trim() || user.displayName?.trim() || '')
    setDraftPhone(profile?.phone ?? '')
    setDraftShip(shippingFromProfile(profile))
    setEditingProfile(true)
    setProfileSaveNotice(null)
    setContactPhoneNotice(null)
    setEditingPhoneContact(false)
  }, [user, profile])

  useEffect(() => {
    const uid = user?.uid
    if (!uid) return

    const ref = doc(db, 'users', uid)
    const unsub = onSnapshot(ref, (snap) => {
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null)
    })
    return unsub
  }, [user?.uid])

  useEffect(() => {
    const uid = user?.uid
    if (!uid) return
    const q = ordersForUserQuery(uid)
    const unsub = onSnapshot(
      q,
      (snap) => {
        setOrdersErr(null)
        const rows: OrderRecord[] = []
        snap.forEach((d) => rows.push(mapOrderDoc(d.id, d.data() as Record<string, unknown>)))
        setOrders(sortOrdersByCreatedAtDesc(rows))
      },
      (err) => {
        setOrdersErr(err.message || 'Could not load orders. Deploy Firestore indexes if needed.')
        setOrders([])
      },
    )
    return unsub
  }, [user?.uid])

  useEffect(() => {
    const uid = user?.uid
    if (!uid) return
    const q = savedDesignsQuery(uid)
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDesignsErr(null)
        const rows: SavedDesignRecord[] = []
        snap.forEach((d) => rows.push(mapSavedDesignDoc(d.id, d.data() as Record<string, unknown>)))
        setDesigns(rows)
      },
      (err) => {
        setDesignsErr(err.message)
        setDesigns([])
      },
    )
    return unsub
  }, [user?.uid])

  if (!ready) {
    return null
  }
  if (!user || !canAccessApp(user)) {
    return <Navigate to="/auth" replace />
  }

  const displayName =
    profile?.displayName?.trim() ||
    user.displayName?.trim() ||
    user.email?.split('@')[0] ||
    'Member'
  const emailDisplay = profile?.email || user.email || ''
  const memberSince = formatMemberSince(profile?.createdAt)
  const phoneDisplay = profile?.phone?.trim() || '—'
  const ship = shippingFromProfile(profile)
  const shipLines = [ship.line1, ship.line2, [ship.city, ship.region, ship.postalCode].filter(Boolean).join(', '), ship.country]
    .filter((l) => l && String(l).trim())

  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const onSignOut = async () => {
    await signOutUser()
    navigate('/', { replace: true })
  }

  const hasPassword = usesPasswordProvider(user)
  const hasGoogle = usesGoogleProvider(user)

  const onLinkGoogle = async () => {
    setLinkNotice(null)
    setLinkBusy(true)
    try {
      await linkGoogleToCurrentUser(user)
      await refreshUser()
      setLinkNotice({
        kind: 'ok',
        message:
          'Google is connected. You can sign in with Google or with email and password.',
      })
    } catch (e) {
      const message =
        e instanceof FirebaseError ? formatAuthError(e) : e instanceof Error ? e.message : formatAuthError(e)
      setLinkNotice({ kind: 'err', message })
    } finally {
      setLinkBusy(false)
    }
  }

  const onSaveProfile = async () => {
    setProfileSaveBusy(true)
    setProfileSaveNotice(null)
    try {
      await updateUserContactAndShipping(user.uid, {
        displayName: draftName,
        phone: draftPhone,
        shippingAddress: draftShip,
      })
      await refreshUser()
      setProfileSaveNotice('Saved.')
      setEditingProfile(false)
    } catch (e) {
      setProfileSaveNotice(
        e instanceof FirebaseError ? formatAuthError(e) : e instanceof Error ? e.message : 'Save failed.',
      )
    } finally {
      setProfileSaveBusy(false)
    }
  }

  const onOrderStatusChange = async (orderId: string, status: OrderStatus) => {
    try {
      await updateUserOrder(orderId, { status })
    } catch (e) {
      setOrdersErr(e instanceof Error ? e.message : 'Update failed.')
    }
  }

  const onDeleteOrder = async (orderId: string) => {
    try {
      await deleteUserOrder(orderId)
    } catch (e) {
      setOrdersErr(e instanceof Error ? e.message : 'Delete failed.')
    }
  }

  const beginEditPhoneInContact = () => {
    setContactPhoneDraft(profile?.phone ?? '')
    setContactPhoneNotice(null)
    setEditingPhoneContact(true)
  }

  const onSavePhoneContact = async () => {
    if (!user) return
    setContactPhoneBusy(true)
    setContactPhoneNotice(null)
    try {
      await updateUserContactAndShipping(user.uid, {
        phone: contactPhoneDraft,
        shippingAddress: shippingFromProfile(profile),
      })
      await refreshUser()
      setEditingPhoneContact(false)
      setContactPhoneNotice('Phone saved.')
    } catch (e) {
      setContactPhoneNotice(
        e instanceof FirebaseError ? formatAuthError(e) : e instanceof Error ? e.message : 'Could not save phone.',
      )
    } finally {
      setContactPhoneBusy(false)
    }
  }

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45, ease }}
      className={cn(
        'flex min-h-0 flex-1 flex-col',
        'px-[clamp(1rem,4vw,2.5rem)]',
        'py-[clamp(1.25rem,4vh,3rem)]',
        'pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]',
        ink.muted,
      )}
    >
      <div className="mx-auto w-full max-w-[min(100%,72rem)]">
        <header className={cn('mb-[clamp(1.75rem,4vw,3rem)] border-b pb-[clamp(1.25rem,3vw,2rem)]', hairline)}>
          <p
            className={cn(
              'm-0 font-[family-name:var(--font-sans)]',
              'text-[clamp(0.62rem,0.55rem+0.35vw,0.72rem)] font-semibold uppercase tracking-[0.18em]',
              ink.label,
            )}
          >
            Account
          </p>
          <h1
            className={cn(
              'mt-1 font-[family-name:var(--font-vogue)] font-semibold italic uppercase tracking-[0.07em]',
              'text-[clamp(1.75rem,1.35rem+2.2vw,2.65rem)] leading-[1.08]',
              ink.strong,
            )}
          >
            Profile
          </h1>
          <p
            className={cn(
              'mt-2 max-w-md font-[family-name:var(--font-sans)]',
              'text-[clamp(0.8rem,0.76rem+0.2vw,0.9rem)] leading-relaxed',
              ink.muted,
            )}
          >
            Your details, orders, and saved designs load from Firestore in real time.
          </p>
        </header>

        <div className="grid gap-[clamp(2rem,5vw,4rem)] lg:grid-cols-12 lg:gap-x-10">
          <motion.aside
            {...fadeUp}
            transition={{ duration: 0.45, ease, delay: 0.05 }}
            className="lg:col-span-4 xl:col-span-3"
          >
            <div className="lg:sticky lg:top-[calc(4.5rem+1rem)]">
              <div
                className={cn(cardShell, 'p-[clamp(1.25rem,3vw,1.75rem)]')}
                style={{ WebkitBackdropFilter: 'blur(14px) saturate(1.25)' }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'flex size-[3.25rem] shrink-0 items-center justify-center rounded-2xl',
                      'bg-[color-mix(in_oklab,var(--ink)_9%,transparent)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--ink)_12%,transparent)]',
                      'font-[family-name:var(--font-sans)] text-[0.95rem] font-semibold tracking-[0.06em]',
                      ink.muted,
                    )}
                    aria-hidden
                  >
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2
                      id="profile-name"
                      className={cn(
                        'm-0 font-[family-name:var(--font-sans)] text-[1.05rem] font-semibold tracking-[-0.02em]',
                        ink.strong,
                      )}
                    >
                      {displayName}
                    </h2>
                    <p
                      className={cn(
                        'm-0 mt-1 truncate font-[family-name:var(--font-sans)] text-[0.82rem]',
                        ink.muted,
                      )}
                    >
                      {emailDisplay}
                    </p>
                    <p
                      className={cn(
                        'm-0 mt-2 font-[family-name:var(--font-sans)] text-[0.72rem]',
                        ink.faint,
                      )}
                    >
                      Member since {memberSince}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={editingProfile ? () => setEditingProfile(false) : openEditProfile}
                    className={cn(
                      'w-full rounded-xl border border-[color-mix(in_oklab,var(--ink)_14%,transparent)]',
                      'bg-[color-mix(in_oklab,var(--ink)_7%,transparent)] py-2.5',
                      'font-[family-name:var(--font-sans)] text-[0.72rem] font-semibold uppercase tracking-[0.14em]',
                      ink.body,
                      'transition-colors hover:border-[color-mix(in_oklab,var(--ink)_22%,transparent)] hover:bg-[color-mix(in_oklab,var(--ink)_11%,transparent)]',
                    )}
                  >
                    {editingProfile ? 'Close editor' : 'Edit profile'}
                  </button>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className={cn(
                      'mt-1 w-full rounded-xl border border-[color-mix(in_oklab,var(--ink)_12%,transparent)] bg-transparent py-2.5',
                      'font-[family-name:var(--font-sans)] text-[0.7rem] font-semibold uppercase tracking-[0.16em]',
                      'text-[color-mix(in_oklab,var(--ink)_72%,transparent)]',
                      'transition-[background-color,border-color,color] duration-300 ease-out',
                      'hover:border-red-400/35 hover:bg-red-500/12 hover:text-red-200',
                    )}
                  >
                    Sign out
                  </button>
                </div>
              </div>

              <Link
                to="/design"
                className={cn(
                  'mt-4 flex items-center justify-between rounded-2xl border border-dashed border-[color-mix(in_oklab,var(--ink)_14%,transparent)]',
                  'px-4 py-3 transition-colors hover:border-[color-mix(in_oklab,var(--ink)_22%,transparent)] hover:bg-[color-mix(in_oklab,var(--ink)_5%,transparent)]',
                )}
              >
                <span
                  className={cn(
                    'font-[family-name:var(--font-sans)] text-[0.72rem] font-semibold uppercase tracking-[0.12em]',
                    ink.muted,
                  )}
                >
                  Open studio
                </span>
                <span className={cn('font-[family-name:var(--font-vogue)] text-sm italic', ink.faint)}>
                  →
                </span>
              </Link>
            </div>
          </motion.aside>

          <div className="flex flex-col gap-[clamp(1.75rem,4vw,2.75rem)] lg:col-span-8 xl:col-span-9">
            {editingProfile ? (
              <motion.section
                {...fadeUp}
                className={cn(cardShell, 'p-[clamp(1.25rem,3vw,1.75rem)]')}
                style={{ WebkitBackdropFilter: 'blur(14px) saturate(1.25)' }}
                aria-labelledby="edit-profile-heading"
              >
                <h3
                  id="edit-profile-heading"
                  className={cn(
                    'm-0 font-[family-name:var(--font-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.16em]',
                    ink.label,
                  )}
                >
                  Edit profile
                </h3>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className={cn('block sm:col-span-2', ink.body)}>
                    <span className={cn('text-[0.65rem] font-medium uppercase tracking-[0.1em]', ink.faint)}>
                      Display name
                    </span>
                    <input className={fieldInput} value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                  </label>
                  <label className={cn('block sm:col-span-2', ink.body)}>
                    <span className={cn('text-[0.65rem] font-medium uppercase tracking-[0.1em]', ink.faint)}>
                      Phone
                    </span>
                    <input
                      className={fieldInput}
                      value={draftPhone}
                      onChange={(e) => setDraftPhone(e.target.value)}
                      autoComplete="tel"
                    />
                  </label>
                  <label className={cn('block sm:col-span-2', ink.body)}>
                    <span className={cn('text-[0.65rem] font-medium uppercase tracking-[0.1em]', ink.faint)}>
                      Address line 1
                    </span>
                    <input
                      className={fieldInput}
                      value={draftShip.line1}
                      onChange={(e) => setDraftShip((s) => ({ ...s, line1: e.target.value }))}
                    />
                  </label>
                  <label className={cn('block sm:col-span-2', ink.body)}>
                    <span className={cn('text-[0.65rem] font-medium uppercase tracking-[0.1em]', ink.faint)}>
                      Address line 2
                    </span>
                    <input
                      className={fieldInput}
                      value={draftShip.line2}
                      onChange={(e) => setDraftShip((s) => ({ ...s, line2: e.target.value }))}
                    />
                  </label>
                  <label className={cn('block', ink.body)}>
                    <span className={cn('text-[0.65rem] font-medium uppercase tracking-[0.1em]', ink.faint)}>
                      City
                    </span>
                    <input
                      className={fieldInput}
                      value={draftShip.city}
                      onChange={(e) => setDraftShip((s) => ({ ...s, city: e.target.value }))}
                    />
                  </label>
                  <label className={cn('block', ink.body)}>
                    <span className={cn('text-[0.65rem] font-medium uppercase tracking-[0.1em]', ink.faint)}>
                      Region / state
                    </span>
                    <input
                      className={fieldInput}
                      value={draftShip.region}
                      onChange={(e) => setDraftShip((s) => ({ ...s, region: e.target.value }))}
                    />
                  </label>
                  <label className={cn('block', ink.body)}>
                    <span className={cn('text-[0.65rem] font-medium uppercase tracking-[0.1em]', ink.faint)}>
                      Postal code
                    </span>
                    <input
                      className={fieldInput}
                      value={draftShip.postalCode}
                      onChange={(e) => setDraftShip((s) => ({ ...s, postalCode: e.target.value }))}
                    />
                  </label>
                  <label className={cn('block', ink.body)}>
                    <span className={cn('text-[0.65rem] font-medium uppercase tracking-[0.1em]', ink.faint)}>
                      Country
                    </span>
                    <input
                      className={fieldInput}
                      value={draftShip.country}
                      onChange={(e) => setDraftShip((s) => ({ ...s, country: e.target.value }))}
                    />
                  </label>
                </div>
                {profileSaveNotice ? (
                  <p className={cn('m-0 mt-4 text-[0.78rem]', ink.muted)}>{profileSaveNotice}</p>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={profileSaveBusy}
                    onClick={onSaveProfile}
                    className={cn(
                      'rounded-xl border border-[color-mix(in_oklab,var(--ink)_18%,transparent)]',
                      'bg-[color-mix(in_oklab,var(--ink)_12%,transparent)] px-5 py-2.5',
                      'font-[family-name:var(--font-sans)] text-[0.72rem] font-semibold uppercase tracking-[0.12em]',
                      ink.body,
                      profileSaveBusy && 'opacity-60',
                    )}
                  >
                    Save changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingProfile(false)}
                    className={cn(
                      'rounded-xl border border-[color-mix(in_oklab,var(--ink)_12%,transparent)] bg-transparent px-5 py-2.5',
                      'font-[family-name:var(--font-sans)] text-[0.7rem] font-semibold uppercase tracking-[0.14em]',
                      ink.muted,
                    )}
                  >
                    Cancel
                  </button>
                </div>
              </motion.section>
            ) : null}

            <motion.section
              {...fadeUp}
              transition={{ duration: 0.45, ease, delay: 0.1 }}
              aria-labelledby="contact-heading"
              className={cn(cardShell, 'p-[clamp(1.25rem,3vw,1.75rem)]')}
              style={{ WebkitBackdropFilter: 'blur(14px) saturate(1.25)' }}
            >
              <h3
                id="contact-heading"
                className={cn(
                  'm-0 font-[family-name:var(--font-sans)]',
                  'text-[0.68rem] font-semibold uppercase tracking-[0.16em]',
                  ink.label,
                )}
              >
                Contact
              </h3>
              <dl className="mt-5 grid gap-6 sm:grid-cols-2">
                <div>
                  <dt
                    className={cn(
                      'font-[family-name:var(--font-sans)] text-[0.65rem] font-medium uppercase tracking-[0.1em]',
                      ink.faint,
                    )}
                  >
                    Email
                  </dt>
                  <dd
                    className={cn(
                      'm-0 mt-1 break-all font-[family-name:var(--font-sans)] text-[0.88rem]',
                      ink.body,
                    )}
                  >
                    {emailDisplay}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt
                    className={cn(
                      'font-[family-name:var(--font-sans)] text-[0.65rem] font-medium uppercase tracking-[0.1em]',
                      ink.faint,
                    )}
                  >
                    Phone
                  </dt>
                  <dd className="m-0 mt-1">
                    {editingPhoneContact ? (
                      <div className="flex flex-col gap-2 sm:max-w-md">
                        <input
                          type="tel"
                          autoComplete="tel"
                          className={fieldInput}
                          value={contactPhoneDraft}
                          onChange={(e) => setContactPhoneDraft(e.target.value)}
                          aria-label="Phone number"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={contactPhoneBusy}
                            onClick={onSavePhoneContact}
                            className={cn(
                              'rounded-lg border border-[color-mix(in_oklab,var(--ink)_16%,transparent)]',
                              'bg-[color-mix(in_oklab,var(--ink)_8%,transparent)] px-3 py-1.5',
                              'font-[family-name:var(--font-sans)] text-[0.65rem] font-semibold uppercase tracking-[0.1em]',
                              ink.body,
                              contactPhoneBusy && 'opacity-60',
                            )}
                          >
                            Save phone
                          </button>
                          <button
                            type="button"
                            disabled={contactPhoneBusy}
                            onClick={() => {
                              setEditingPhoneContact(false)
                              setContactPhoneNotice(null)
                            }}
                            className={cn(
                              'rounded-lg border-0 bg-transparent px-3 py-1.5',
                              'font-[family-name:var(--font-sans)] text-[0.65rem] font-semibold uppercase tracking-[0.1em]',
                              ink.muted,
                            )}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span
                          className={cn(
                            'font-[family-name:var(--font-sans)] text-[0.88rem]',
                            ink.body,
                          )}
                        >
                          {phoneDisplay}
                        </span>
                        <button
                          type="button"
                          onClick={beginEditPhoneInContact}
                          className={cn(
                            'border-0 bg-transparent p-0',
                            'font-[family-name:var(--font-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.12em]',
                            ink.muted,
                            'underline decoration-[color-mix(in_oklab,var(--ink)_20%,transparent)] underline-offset-4 hover:text-[color-mix(in_oklab,var(--ink)_88%,transparent)]',
                          )}
                        >
                          Update phone
                        </button>
                      </div>
                    )}
                    {contactPhoneNotice && !editingPhoneContact ? (
                      <p className={cn('m-0 mt-2 text-[0.72rem]', ink.muted)}>{contactPhoneNotice}</p>
                    ) : null}
                    {contactPhoneNotice && editingPhoneContact && contactPhoneNotice !== 'Phone saved.' ? (
                      <p role="alert" className="m-0 mt-2 text-[0.72rem] text-red-200/90">
                        {contactPhoneNotice}
                      </p>
                    ) : null}
                  </dd>
                </div>
              </dl>

              <div className={cn('mt-8 border-t pt-6', hairline)}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h4
                    className={cn(
                      'm-0 font-[family-name:var(--font-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.14em]',
                      ink.label,
                    )}
                  >
                    Shipping
                  </h4>
                  <button
                    type="button"
                    onClick={openEditProfile}
                    className={cn(
                      'border-0 bg-transparent p-0',
                      'font-[family-name:var(--font-sans)] text-[0.65rem] font-semibold uppercase tracking-[0.12em]',
                      ink.muted,
                      'underline decoration-[color-mix(in_oklab,var(--ink)_20%,transparent)] underline-offset-4 hover:text-[color-mix(in_oklab,var(--ink)_88%,transparent)]',
                    )}
                  >
                    Update
                  </button>
                </div>
                <p
                  className={cn(
                    'm-0 mt-3 max-w-md font-[family-name:var(--font-sans)] text-[0.88rem] leading-relaxed',
                    ink.body,
                  )}
                >
                  {shipLines.length ? (
                    shipLines.map((line, i) => (
                      <span key={i}>
                        {line}
                        {i < shipLines.length - 1 ? <br /> : null}
                      </span>
                    ))
                  ) : (
                    <span className={ink.faint}>No address saved yet.</span>
                  )}
                </p>
              </div>
            </motion.section>

            <motion.section
              {...fadeUp}
              transition={{ duration: 0.45, ease, delay: 0.12 }}
              aria-labelledby="signin-methods-heading"
              className={cn(cardShell, 'p-[clamp(1.25rem,3vw,1.75rem)]')}
              style={{ WebkitBackdropFilter: 'blur(14px) saturate(1.25)' }}
            >
              <h3
                id="signin-methods-heading"
                className={cn(
                  'm-0 font-[family-name:var(--font-sans)]',
                  'text-[0.68rem] font-semibold uppercase tracking-[0.16em]',
                  ink.label,
                )}
              >
                Sign-in methods
              </h3>
              <p
                className={cn(
                  'm-0 mt-3 max-w-lg font-[family-name:var(--font-sans)] text-[0.88rem] leading-relaxed',
                  ink.faint,
                )}
              >
                Link Google to the same email you use here so you can sign in either way. Use the Google
                account that matches <span className={ink.body}>{emailDisplay}</span>.
              </p>

              <ul className="m-0 mt-5 list-none space-y-3 p-0">
                <li
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-2 border-b border-[color-mix(in_oklab,var(--ink)_8%,transparent)] pb-3',
                  )}
                >
                  <span className={cn('font-[family-name:var(--font-sans)] text-[0.82rem]', ink.body)}>
                    Email &amp; password
                  </span>
                  <span
                    className={cn(
                      'font-[family-name:var(--font-sans)] text-[0.72rem] font-medium uppercase tracking-[0.12em]',
                      hasPassword ? ink.muted : ink.faint,
                    )}
                  >
                    {hasPassword ? 'Connected' : 'Not set'}
                  </span>
                </li>
                <li className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className={cn('flex items-center gap-2 font-[family-name:var(--font-sans)] text-[0.82rem]', ink.body)}>
                    <GoogleGlyph className="shrink-0" />
                    Google
                  </span>
                  <span
                    className={cn(
                      'font-[family-name:var(--font-sans)] text-[0.72rem] font-medium uppercase tracking-[0.12em]',
                      hasGoogle ? ink.muted : ink.faint,
                    )}
                  >
                    {hasGoogle ? 'Connected' : 'Not linked'}
                  </span>
                </li>
              </ul>

              {hasPassword && !hasGoogle ? (
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={onLinkGoogle}
                  className={cn(
                    'mt-5 flex w-full items-center justify-center gap-3',
                    'rounded-xl border border-[color-mix(in_oklab,var(--ink)_12%,transparent)]',
                    'bg-[color-mix(in_oklab,var(--ink)_6%,transparent)] py-2.5',
                    'font-[family-name:var(--font-sans)] text-[0.72rem] font-semibold tracking-[0.04em]',
                    ink.body,
                    'transition-[background,border-color,opacity] duration-200',
                    'hover:border-[color-mix(in_oklab,var(--ink)_20%,transparent)] hover:bg-[color-mix(in_oklab,var(--ink)_9%,transparent)]',
                    linkBusy && 'pointer-events-none opacity-60',
                  )}
                >
                  <GoogleGlyph />
                  Link Google account
                </button>
              ) : null}

              {hasPassword && hasGoogle ? (
                <p
                  className={cn(
                    'm-0 mt-4 font-[family-name:var(--font-sans)] text-[0.78rem] leading-relaxed',
                    ink.faint,
                  )}
                >
                  Both sign-in methods are active for this account.
                </p>
              ) : null}

              {!hasPassword && hasGoogle ? (
                <p
                  className={cn(
                    'm-0 mt-4 font-[family-name:var(--font-sans)] text-[0.78rem] leading-relaxed',
                    ink.faint,
                  )}
                >
                  You are currently using Google sign-in for this account.
                </p>
              ) : null}

              {linkNotice ? (
                <p
                  role={linkNotice.kind === 'err' ? 'alert' : 'status'}
                  className={cn(
                    'm-0 mt-4 rounded-xl border px-3 py-2 font-[family-name:var(--font-sans)] text-[0.72rem] leading-relaxed',
                    linkNotice.kind === 'err'
                      ? 'border-red-400/35 bg-red-500/12 text-red-100/90'
                      : 'border-emerald-500/25 bg-emerald-500/10 text-[color-mix(in_oklab,var(--ink)_78%,transparent)]',
                  )}
                >
                  {linkNotice.message}
                </p>
              ) : null}
            </motion.section>

            <motion.section
              {...fadeUp}
              transition={{ duration: 0.45, ease, delay: 0.14 }}
              aria-labelledby="orders-heading"
              className={cn(cardShell, 'p-[clamp(1.25rem,3vw,1.75rem)]')}
              style={{ WebkitBackdropFilter: 'blur(14px) saturate(1.25)' }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3
                  id="orders-heading"
                  className={cn(
                    'm-0 font-[family-name:var(--font-sans)]',
                    'text-[0.68rem] font-semibold uppercase tracking-[0.16em]',
                    ink.label,
                  )}
                >
                  Orders
                </h3>
                <span className={cn('font-[family-name:var(--font-sans)] text-[0.72rem]', ink.faint)}>
                  {orders.length} total
                </span>
              </div>

              {ordersErr ? (
                <p role="alert" className="m-0 mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[0.78rem] text-amber-100/95">
                  {ordersErr}
                </p>
              ) : null}

              {orders.length === 0 && !ordersErr ? (
                <p className={cn('m-0 mt-5 font-[family-name:var(--font-sans)] text-[0.88rem]', ink.faint)}>
                  No orders yet. Complete checkout from your bag to see full receipts here.
                </p>
              ) : (
                <ul className={cn('m-0 mt-5 list-none divide-y p-0', 'divide-[color-mix(in_oklab,var(--ink)_8%,transparent)]')}>
                  {orders.map((o) => (
                    <li key={o.id} className="flex flex-col gap-3 py-4 first:pt-0">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p
                            className={cn(
                              'm-0 font-mono text-[0.82rem] font-medium tracking-[0.04em]',
                              ink.strong,
                            )}
                          >
                            {o.orderNumber}
                          </p>
                          <p
                            className={cn(
                              'm-0 mt-0.5 font-[family-name:var(--font-sans)] text-[0.78rem]',
                              ink.faint,
                            )}
                          >
                            {formatFirestoreDate(o.createdAt)} · {o.currency}
                          </p>
                          {(o.customerName || o.customerEmail) ? (
                            <p
                              className={cn(
                                'm-0 mt-2 font-[family-name:var(--font-sans)] text-[0.76rem] leading-snug',
                                ink.muted,
                              )}
                            >
                              <span className="font-semibold text-[color-mix(in_oklab,var(--ink)_72%,transparent)]">
                                {o.customerName || '—'}
                              </span>
                              {o.customerEmail ? (
                                <>
                                  <span className="text-[color-mix(in_oklab,var(--ink)_32%,transparent)]"> · </span>
                                  {o.customerEmail}
                                </>
                              ) : null}
                            </p>
                          ) : null}
                          <p
                            className={cn(
                              'm-0 mt-1.5 max-w-[40rem] font-[family-name:var(--font-sans)] text-[0.72rem] leading-relaxed',
                              ink.faint,
                            )}
                          >
                            <span className="font-semibold uppercase tracking-[0.12em] text-[color-mix(in_oklab,var(--ink)_38%,transparent)]">
                              Ship to
                            </span>{' '}
                            {formatOrderAddress(o.shippingAddressSnapshot)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={o.status}
                            onChange={(e) => onOrderStatusChange(o.id, e.target.value as OrderStatus)}
                            className={cn(
                              'rounded-lg border border-[color-mix(in_oklab,var(--ink)_14%,transparent)]',
                              'bg-[color-mix(in_oklab,var(--bg)_4%,transparent)] px-2 py-1.5',
                              'font-[family-name:var(--font-sans)] text-[0.72rem]',
                              ink.body,
                            )}
                          >
                            {ORDER_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {titleStatus(s)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => onDeleteOrder(o.id)}
                            className={cn(
                              'rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-1.5',
                              'font-[family-name:var(--font-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.1em]',
                              'text-red-200/90 hover:bg-red-500/18',
                            )}
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl bg-[color-mix(in_oklab,var(--ink)_4%,transparent)] px-3 py-2.5 ring-1 ring-inset ring-[color-mix(in_oklab,var(--ink)_8%,transparent)]">
                        <p
                          className={cn(
                            'm-0 mb-2 font-[family-name:var(--font-sans)] text-[0.62rem] font-bold uppercase tracking-[0.14em]',
                            ink.label,
                          )}
                        >
                          Items
                        </p>
                        <ul className="m-0 list-none space-y-2 p-0">
                          {o.items.map((item, idx) => {
                            const lineLabel = item.title ?? item.name
                            const lineDetail = [item.size && `Size ${item.size}`, item.variant].filter(Boolean).join(' · ')
                            return (
                              <li
                                key={`${o.id}-${idx}`}
                                className="font-[family-name:var(--font-sans)] text-[0.72rem] leading-snug text-[color-mix(in_oklab,var(--ink)_78%,transparent)]"
                              >
                                <span className="font-semibold">{lineLabel}</span>
                                {lineDetail ? (
                                  <span className="text-[color-mix(in_oklab,var(--ink)_52%,transparent)]">
                                    {' '}
                                    · {lineDetail}
                                  </span>
                                ) : null}
                                <span className="block font-mono tabular-nums text-[0.68rem] text-[color-mix(in_oklab,var(--ink)_48%,transparent)] sm:inline sm:before:content-['_|_']">
                                  {item.quantity} × ${item.unitPrice}{' '}
                                  → ${(item.quantity * item.unitPrice).toFixed(item.unitPrice % 1 !== 0 ? 2 : 0)}
                                </span>
                                {item.sku ? (
                                  <span className="ml-0 block text-[0.65rem] text-[color-mix(in_oklab,var(--ink)_34%,transparent)] sm:ml-1 sm:inline">
                                    ({item.sku})
                                  </span>
                                ) : null}
                              </li>
                            )
                          })}
                        </ul>
                      </div>

                      <div
                        className={cn(
                          'flex flex-col gap-1 font-mono text-[0.72rem] tabular-nums sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-4 sm:gap-y-1',
                          ink.muted,
                        )}
                      >
                        <span>Merchandise ${o.subtotal.toFixed(0)}</span>
                        <span className="hidden sm:inline">·</span>
                        <span>Shipping ${o.shippingFee.toFixed(0)}</span>
                        <span className="hidden sm:inline">·</span>
                        <span>Tax ${o.taxEstimated.toFixed(0)}</span>
                        <span className="hidden sm:inline">·</span>
                        <span className={cn('font-[family-name:var(--font-vogue)] text-[0.9rem] italic', ink.strong)}>
                          Total ${o.orderTotal.toFixed(0)}
                        </span>
                      </div>

                      <p className={cn('m-0 font-[family-name:var(--font-sans)] text-[0.72rem]', ink.muted)}>
                        <span className={cn('font-medium', statusTone(o.status))}>{titleStatus(o.status)}</span>
                        {o.notes ? (
                          <span className="text-[color-mix(in_oklab,var(--ink)_42%,transparent)]">
                            {' '}
                            · {o.notes}
                          </span>
                        ) : null}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </motion.section>

            <motion.section
              {...fadeUp}
              transition={{ duration: 0.45, ease, delay: 0.22 }}
              aria-labelledby="saved-heading"
              className={cn(cardShell, 'p-[clamp(1.25rem,3vw,1.75rem)]')}
              style={{ WebkitBackdropFilter: 'blur(14px) saturate(1.25)' }}
            >
              <h3
                id="saved-heading"
                className={cn(
                  'm-0 font-[family-name:var(--font-sans)]',
                  'text-[0.68rem] font-semibold uppercase tracking-[0.16em]',
                  ink.label,
                )}
              >
                Saved designs
              </h3>
              <p
                className={cn(
                  'm-0 mt-3 max-w-lg font-[family-name:var(--font-sans)] text-[0.88rem] leading-relaxed',
                  ink.faint,
                )}
              >
                Designs you save from the studio appear here. This page only shows them; add or change designs
                in the studio.
              </p>

              {designsErr ? (
                <p role="alert" className="m-0 mt-4 rounded-xl border border-red-400/35 bg-red-500/12 px-3 py-2 text-[0.78rem] text-red-100/90">
                  {designsErr}
                </p>
              ) : null}

              <ul className="m-0 mt-5 list-none space-y-4 p-0">
                {designs.length === 0 ? (
                  <li className={cn('font-[family-name:var(--font-sans)] text-[0.88rem]', ink.faint)}>
                    No saved designs yet.
                  </li>
                ) : (
                  designs.map((d) => (
                    <li
                      key={d.id}
                      className={cn(
                        'rounded-xl border border-[color-mix(in_oklab,var(--ink)_10%,transparent)] p-4',
                        'bg-[color-mix(in_oklab,var(--ink)_4%,transparent)]',
                      )}
                    >
                      <p className={cn('m-0 font-[family-name:var(--font-sans)] text-[0.9rem] font-semibold', ink.strong)}>
                        {d.name}
                      </p>
                      <p className={cn('m-0 mt-1 font-[family-name:var(--font-sans)] text-[0.75rem]', ink.faint)}>
                        Updated {formatFirestoreDate(d.updatedAt)}
                      </p>
                      {d.notes ? (
                        <p className={cn('m-0 mt-2 max-w-xl font-[family-name:var(--font-sans)] text-[0.82rem]', ink.muted)}>
                          {d.notes}
                        </p>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>

              <Link
                to="/design"
                className={cn(
                  'mt-6 inline-flex items-center gap-2',
                  'font-[family-name:var(--font-sans)] text-[0.72rem] font-semibold uppercase tracking-[0.12em]',
                  ink.muted,
                  'underline decoration-[color-mix(in_oklab,var(--ink)_22%,transparent)] underline-offset-4 hover:text-[color-mix(in_oklab,var(--ink)_88%,transparent)]',
                )}
              >
                Open studio to save designs <span aria-hidden>→</span>
              </Link>
            </motion.section>
          </div>
        </div>
      </div>
    </motion.main>
  )
}
