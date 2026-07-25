import { describe, expect, it } from 'vitest'
import { REFERRAL_SOURCE, withReferralSource } from './outboundLink'

describe('withReferralSource', () => {
  it('tags a shop link so the shop can see where the visit came from', () => {
    expect(withReferralSource('https://oger.nl/products/oger-shirt-271729')).toBe(
      `https://oger.nl/products/oger-shirt-271729?${'utm_source'}=${REFERRAL_SOURCE}`,
    )
  })

  it('keeps a link that already carries its own query and fragment', () => {
    expect(withReferralSource('https://www.takealot.com/x/PLID1?sku=9#reviews')).toBe(
      `https://www.takealot.com/x/PLID1?sku=9&utm_source=${REFERRAL_SOURCE}#reviews`,
    )
  })

  // A retailer's own campaign tag is how they measure spend they paid for.
  // Overwriting it would quietly take the credit for somebody else's visit.
  it('leaves a retailer’s own campaign tag alone', () => {
    const paid = 'https://oger.nl/products/shirt?utm_source=google&utm_medium=cpc'

    expect(withReferralSource(paid)).toBe(paid)
  })

  it('does not credit us with sending ourselves traffic', () => {
    const own = 'https://trolleyscout.co.za/deals'

    expect(withReferralSource(own)).toBe(own)
    expect(withReferralSource('https://www.trolleyscout.co.za/stores'))
      .toBe('https://www.trolleyscout.co.za/stores')
  })

  // The tag is a courtesy; the shopper reaching the shop is the point. Anything
  // untaggable is handed back exactly as it came rather than broken.
  it('hands back anything it cannot tag, rather than breaking the link', () => {
    expect(withReferralSource('mailto:help@oger.nl')).toBe('mailto:help@oger.nl')
    expect(withReferralSource('/products/local-path')).toBe('/products/local-path')
    expect(withReferralSource('not a url at all')).toBe('not a url at all')
    expect(withReferralSource('')).toBeUndefined()
    expect(withReferralSource(undefined)).toBeUndefined()
    expect(withReferralSource(null)).toBeUndefined()
  })

  it('tags plain http as well as https', () => {
    expect(withReferralSource('http://okzim.co.zw/specials')).toBe(
      `http://okzim.co.zw/specials?utm_source=${REFERRAL_SOURCE}`,
    )
  })
})
