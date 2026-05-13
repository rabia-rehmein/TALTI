import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { CartItemRecord, CartPatternMap } from './firestoreTypes'

export function cartItemsQuery(uid: string) {
  return query(
    collection(db, 'users', uid, 'cartItems'),
    orderBy('updatedAt', 'desc'),
  )
}

function shortHash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export function makeCartLineId(
  garmentId: string,
  size: string,
  designKey: string,
): string {
  return `${garmentId}__${size}__${shortHash(designKey)}`
}

function toCartPatternMap(m: unknown): CartPatternMap {
  if (!m || typeof m !== 'object') {
    return {
      offsetU: 0,
      offsetV: 0,
      repeatU: 1,
      repeatV: 1,
      patternScale: 1,
      invert: false,
      invertV: false,
    }
  }
  const o = m as Record<string, unknown>
  return {
    offsetU: Number(o.offsetU) || 0,
    offsetV: Number(o.offsetV) || 0,
    repeatU: Number(o.repeatU) || 1,
    repeatV: Number(o.repeatV) || 1,
    patternScale: Number(o.patternScale) || 1,
    invert: Boolean(o.invert),
    invertV: Boolean(o.invertV),
  }
}

export function mapCartItemDoc(
  id: string,
  data: Record<string, unknown>,
): CartItemRecord {
  const sz = String(data.size ?? 'M')
  const size = sz === 'S' || sz === 'M' || sz === 'L' ? sz : 'M'
  return {
    id,
    garmentId: String(data.garmentId ?? ''),
    title: String(data.title ?? ''),
    size,
    unitPrice: Number(data.unitPrice) || 0,
    qty: Math.min(99, Math.max(1, Number(data.qty) || 1)),
    variant: String(data.variant ?? ''),
    glbPath: String(data.glbPath ?? ''),
    sku: String(data.sku ?? ''),
    currency: String(data.currency ?? 'USD'),
    colorHex: data.colorHex == null ? null : String(data.colorHex),
    buttonColorHex:
      data.buttonColorHex == null ? null : String(data.buttonColorHex),
    patternName:
      data.patternName == null ? null : String(data.patternName),
    patternMap: toCartPatternMap(data.patternMap),
    designKey: String(data.designKey ?? ''),
    createdAt: (data.createdAt as Timestamp) ?? null,
    updatedAt: (data.updatedAt as Timestamp) ?? null,
  }
}

export function subscribeCartItems(
  uid: string,
  onLines: (lines: CartItemRecord[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    cartItemsQuery(uid),
    (snap) => {
      const lines = snap.docs.map((d) =>
        mapCartItemDoc(d.id, d.data() as Record<string, unknown>),
      )
      onLines(lines)
    },
    (err) => onError?.(err),
  )
}

export type AddCartLineInput = {
  garmentId: string
  title: string
  size: 'S' | 'M' | 'L'
  unitPrice: number
  variant: string
  glbPath: string
  sku: string
  colorHex: string | null
  buttonColorHex: string | null
  patternName: string | null
  patternMap: CartPatternMap
  designKey: string
  addQty?: number
}

export async function addOrIncrementCartLine(
  uid: string,
  input: AddCartLineInput,
): Promise<void> {
  const lineId = makeCartLineId(input.garmentId, input.size, input.designKey)
  const ref = doc(db, 'users', uid, 'cartItems', lineId)
  const addQty = Math.min(99, Math.max(1, input.addQty ?? 1))

  const payload = {
    garmentId: input.garmentId,
    title: input.title,
    size: input.size,
    unitPrice: input.unitPrice,
    variant: input.variant.slice(0, 500),
    glbPath: input.glbPath,
    sku: input.sku,
    currency: 'USD',
    colorHex: input.colorHex,
    buttonColorHex: input.buttonColorHex,
    patternName: input.patternName,
    patternMap: input.patternMap,
    designKey: input.designKey.slice(0, 200),
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) {
      tx.set(ref, {
        ...payload,
        qty: addQty,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } else {
      const cur = snap.data() as { qty?: number }
      const next = Math.min(99, (Number(cur.qty) || 1) + addQty)
      tx.update(ref, { qty: next, updatedAt: serverTimestamp() })
    }
  })
}

export async function updateCartLineQty(
  uid: string,
  lineId: string,
  qty: number,
): Promise<void> {
  const q = Math.min(99, Math.max(1, Math.floor(qty)))
  const ref = doc(db, 'users', uid, 'cartItems', lineId)
  await updateDoc(ref, { qty: q, updatedAt: serverTimestamp() })
}

export async function removeCartLine(uid: string, lineId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'cartItems', lineId))
}

/** Removes all cart lines after a successful checkout (or reset). */
export async function clearCartForUser(uid: string): Promise<void> {
  const snap = await getDocs(collection(db, 'users', uid, 'cartItems'))
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
}