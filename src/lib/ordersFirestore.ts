import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { OrderLineItem, OrderRecord, OrderStatus, ShippingAddress } from './firestoreTypes'

/** Single-field index on `userId` only (no composite). Newest first via {@link sortOrdersByCreatedAtDesc}. */
export function ordersForUserQuery(uid: string) {
  return query(collection(db, 'orders'), where('userId', '==', uid))
}

export function sortOrdersByCreatedAtDesc(orders: OrderRecord[]): OrderRecord[] {
  return [...orders].sort((a, b) => {
    const ma = a.createdAt?.toMillis() ?? 0
    const mb = b.createdAt?.toMillis() ?? 0
    return mb - ma
  })
}

export function mapOrderDoc(id: string, data: Record<string, unknown>): OrderRecord {
  const snap = data.shippingAddressSnapshot
  const shipping: ShippingAddress =
    snap && typeof snap === 'object' && !Array.isArray(snap)
      ? {
          line1: String((snap as ShippingAddress).line1 ?? ''),
          line2: String((snap as ShippingAddress).line2 ?? ''),
          city: String((snap as ShippingAddress).city ?? ''),
          region: String((snap as ShippingAddress).region ?? ''),
          postalCode: String((snap as ShippingAddress).postalCode ?? ''),
          country: String((snap as ShippingAddress).country ?? ''),
        }
      : {
          line1: '',
          line2: '',
          city: '',
          region: '',
          postalCode: '',
          country: '',
        }

  const subtotal = typeof data.subtotal === 'number' ? data.subtotal : 0
  return {
    id,
    userId: String(data.userId ?? ''),
    orderNumber: String(data.orderNumber ?? ''),
    status: (data.status as OrderStatus) ?? 'pending',
    items: Array.isArray(data.items) ? (data.items as OrderLineItem[]) : [],
    subtotal,
    currency: String(data.currency ?? 'USD'),
    shippingAddressSnapshot: shipping,
    notes: String(data.notes ?? ''),
    customerEmail: String(data.customerEmail ?? ''),
    customerName: String(data.customerName ?? ''),
    shippingFee: typeof data.shippingFee === 'number' ? data.shippingFee : 0,
    taxEstimated: typeof data.taxEstimated === 'number' ? data.taxEstimated : 0,
    orderTotal:
      typeof data.orderTotal === 'number'
        ? data.orderTotal
        : subtotal,
    createdAt: (data.createdAt as Timestamp) ?? null,
    updatedAt: (data.updatedAt as Timestamp) ?? null,
  }
}

export async function createUserOrder(
  uid: string,
  input: {
    items: OrderLineItem[]
    subtotal: number
    currency?: string
    shippingAddressSnapshot: ShippingAddress
    status?: OrderStatus
    notes?: string
    orderNumber?: string
    customerEmail: string
    customerName: string
    shippingFee: number
    taxEstimated: number
    orderTotal: number
  },
): Promise<string> {
  const orderNumber = input.orderNumber ?? `TL-${Date.now().toString(36).toUpperCase()}`
  const ref = await addDoc(collection(db, 'orders'), {
    userId: uid,
    orderNumber,
    status: input.status ?? 'pending',
    items: input.items,
    subtotal: input.subtotal,
    currency: input.currency ?? 'USD',
    shippingAddressSnapshot: input.shippingAddressSnapshot,
    notes: input.notes ?? '',
    customerEmail: input.customerEmail.trim(),
    customerName: input.customerName.trim(),
    shippingFee: input.shippingFee,
    taxEstimated: input.taxEstimated,
    orderTotal: input.orderTotal,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateUserOrder(
  orderId: string,
  patch: { status?: OrderStatus; notes?: string },
): Promise<void> {
  const ref = doc(db, 'orders', orderId)
  await updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteUserOrder(orderId: string): Promise<void> {
  await deleteDoc(doc(db, 'orders', orderId))
}
