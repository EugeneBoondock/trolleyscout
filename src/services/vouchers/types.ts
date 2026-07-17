export type VoucherKind = 'loyalty_offer' | 'product_coupon' | 'public_code'

export type VoucherRedemptionMode = 'automatic' | 'clip' | 'code' | 'loyalty'

export interface VoucherCandidate {
  accountRequired: boolean
  benefitText: string
  capturedAt: string
  code?: string
  evidenceText: string
  externalId: string
  imageUrl?: string
  productId?: string
  productTitle?: string
  publicReusable: boolean
  redemptionMode: VoucherRedemptionMode
  redemptionUrl: string
  retailerId: string
  sourceUrl: string
  termsText?: string
  title: string
  validFrom?: string
  validTo?: string
  voucherKind: VoucherKind
}

export interface Voucher extends VoucherCandidate {
  claimed: boolean
  createdAt: string
  expiresAt: string
  id: string
  lastSeenAt: string
  status: 'active' | 'expired' | 'inactive'
  updatedAt: string
}
