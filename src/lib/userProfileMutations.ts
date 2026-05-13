import { updateProfile } from 'firebase/auth'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
import type { ShippingAddress } from './firestoreTypes'

export async function updateUserContactAndShipping(
  uid: string,
  input: {
    /** When set (including empty string), updates Auth + Firestore display name. Omit to leave unchanged. */
    displayName?: string
    phone: string
    shippingAddress: ShippingAddress
  },
): Promise<void> {
  const user = auth.currentUser

  if (input.displayName !== undefined && user && user.uid === uid) {
    const name = input.displayName.trim()
    if (name) await updateProfile(user, { displayName: name })
  }

  const ref = doc(db, 'users', uid)
  const patch: Record<string, unknown> = {
    phone: input.phone.trim(),
    shippingAddress: {
      line1: input.shippingAddress.line1.trim(),
      line2: input.shippingAddress.line2.trim(),
      city: input.shippingAddress.city.trim(),
      region: input.shippingAddress.region.trim(),
      postalCode: input.shippingAddress.postalCode.trim(),
      country: input.shippingAddress.country.trim(),
    },
    updatedAt: serverTimestamp(),
  }

  if (input.displayName !== undefined) {
    const name = input.displayName.trim()
    patch.displayName = name || (user?.email?.split('@')[0] ?? 'Member')
  }

  await updateDoc(ref, patch)
}
