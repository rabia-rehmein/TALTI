import type { Timestamp } from 'firebase/firestore'

/** Stored on `users/{uid}` and snapshotted on orders. */
export type ShippingAddress = {
  line1: string
  line2: string
  city: string
  region: string
  postalCode: string
  country: string
}

export function emptyShippingAddress(): ShippingAddress {
  return {
    line1: '',
    line2: '',
    city: '',
    region: '',
    postalCode: '',
    country: '',
  }
}

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'

/** Snapshot of each cart line at checkout (stored on `orders`). */
export type OrderLineItem = {
  /** Combined label for receipts — e.g. "T‑Shirt — Size M · …" */
  name: string
  quantity: number
  unitPrice: number
  sku?: string
  title?: string
  garmentId?: string
  size?: string
  /** Studio variant line (colors, pattern, etc.) */
  variant?: string
  glbPath?: string
}

export type OrderRecord = {
  id: string
  userId: string
  orderNumber: string
  status: OrderStatus
  items: OrderLineItem[]
  /** Merchandise subtotal (sum of line items before shipping/tax). */
  subtotal: number
  currency: string
  shippingAddressSnapshot: ShippingAddress
  notes: string
  /** Customer as entered at checkout (snapshot). */
  customerEmail: string
  customerName: string
  shippingFee: number
  taxEstimated: number
  /** Full estimated total at checkout (merch + shipping + tax). */
  orderTotal: number
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

export type SavedDesignRecord = {
  id: string
  name: string
  notes: string
  /** Arbitrary JSON-serializable studio state */
  designPayload: Record<string, unknown>
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

/** `users/{uid}/cartItems/{lineId}` — lineId is deterministic per garment, size, and design key. */
export type CartPatternMap = {
  offsetU: number
  offsetV: number
  repeatU: number
  repeatV: number
  patternScale: number
  invert: boolean
  invertV: boolean
}

export type CartItemRecord = {
  id: string
  garmentId: string
  title: string
  size: 'S' | 'M' | 'L'
  unitPrice: number
  qty: number
  variant: string
  glbPath: string
  sku: string
  currency: string
  colorHex: string | null
  buttonColorHex: string | null
  patternName: string | null
  patternMap: CartPatternMap
  designKey: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}
