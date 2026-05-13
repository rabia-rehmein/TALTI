/** Shown on cards / cart; tied to garment `id` in DesignPage `GARMENTS`. */
export type GarmentCatalogEntry = {
  price: number
  currency: 'USD'
  sku: string
  /** One line for cards (material / fit) */
  blurb: string
}

export const GARMENT_SIZES = ['S', 'M', 'L'] as const
export type GarmentSize = (typeof GARMENT_SIZES)[number]

export type GarmentId =
  | 'male-tshirt'
  | 'male-long-sleeve'
  | 'male-shirt'
  | 'female-tee'

const CATALOG: Record<GarmentId, GarmentCatalogEntry> = {
  'male-tshirt': {
    price: 52,
    currency: 'USD',
    sku: 'TLT-M-TEE',
    blurb: 'Cotton jersey · classic fit',
  },
  'male-long-sleeve': {
    price: 118,
    currency: 'USD',
    sku: 'TLT-M-LS',
    blurb: 'Midweight · long sleeve',
  },
  'male-shirt': {
    price: 98,
    currency: 'USD',
    sku: 'TLT-M-SH',
    blurb: 'Structured shirt · baked style',
  },
  'female-tee': {
    price: 52,
    currency: 'USD',
    sku: 'TLT-W-TEE',
    blurb: 'Cotton jersey · classic fit',
  },
}

export function getGarmentCatalog(id: string): GarmentCatalogEntry {
  const entry = CATALOG[id as GarmentId]
  return entry ?? {
    price: 64,
    currency: 'USD',
    sku: 'TLT-APP',
    blurb: 'Custom garment',
  }
}
