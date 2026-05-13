import type { User } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { emptyShippingAddress } from './firestoreTypes'
import { db } from './firebase'
import { usesPasswordProvider } from './authUtils'

export type PrimaryProvider = 'password' | 'google.com'

export type UserProfile = {
  email: string
  displayName: string
  photoURL: string | null
  emailVerified: boolean
  primaryProvider: PrimaryProvider
  phone: string
  shippingAddress: {
    line1: string
    line2: string
    city: string
    region: string
    postalCode: string
    country: string
  }
  createdAt: unknown
  updatedAt: unknown
}

function primaryProviderFor(user: User): PrimaryProvider {
  return user.providerData.some((p) => p.providerId === 'google.com')
    ? 'google.com'
    : 'password'
}

/** Creates or updates `users/{uid}` auth-mirrored fields without wiping phone or address. */
export async function ensureUserProfile(user: User): Promise<void> {
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  const email = user.email ?? ''
  const displayName =
    user.displayName?.trim() ||
    (usesPasswordProvider(user) ? '' : email.split('@')[0] || 'User')
  const base = {
    email,
    displayName,
    photoURL: user.photoURL ?? null,
    emailVerified: user.emailVerified,
    primaryProvider: primaryProviderFor(user),
    updatedAt: serverTimestamp(),
  }
  if (!snap.exists()) {
    await setDoc(ref, {
      ...base,
      phone: '',
      shippingAddress: emptyShippingAddress(),
      createdAt: serverTimestamp(),
    })
  } else {
    const data = snap.data() as Record<string, unknown>
    const patch: Record<string, unknown> = { ...base }
    if (typeof data.phone !== 'string') {
      patch.phone = ''
    }
    const sa = data.shippingAddress
    if (!sa || typeof sa !== 'object') {
      patch.shippingAddress = emptyShippingAddress()
    }
    await updateDoc(ref, patch)
  }
}
