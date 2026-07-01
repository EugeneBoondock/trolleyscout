import { describe, expect, it } from 'vitest'
import type { OfferDraft } from '../types'
import { isRetailerSourceUrl, validateOfferDraft } from './offerValidation'

const validDraft: OfferDraft = {
  capturedAt: '2026-07-01',
  priceText: 'Source price text',
  retailerId: 'clicks',
  savingText: 'Source saving text',
  sourceUrl: 'https://clicks.co.za/clubcard',
  termsText: 'ClubCard terms from source',
  title: 'Source offer title',
  validFrom: '2026-07-01',
  validTo: '2026-07-07',
}

describe('offerValidation', () => {
  it('accepts a complete offer draft from the selected retailer source', () => {
    const result = validateOfferDraft(validDraft, {
      now: new Date('2026-07-01T12:00:00.000Z'),
    })

    expect(result.accepted).toBe(true)
    expect(result.normalizedOffer?.retailerId).toBe('clicks')
  })

  it('rejects source URLs outside the selected retailer domain', () => {
    const result = validateOfferDraft(
      {
        ...validDraft,
        sourceUrl: 'https://example.com/offers',
      },
      {
        now: new Date('2026-07-01T12:00:00.000Z'),
      },
    )

    expect(result.accepted).toBe(false)
    expect(result.issues.some((issue) => issue.field === 'sourceUrl')).toBe(true)
  })

  it('warns when optional saving text is missing', () => {
    const result = validateOfferDraft(
      {
        ...validDraft,
        savingText: '',
      },
      {
        now: new Date('2026-07-01T12:00:00.000Z'),
      },
    )

    expect(result.accepted).toBe(true)
    expect(result.issues.some((issue) => issue.field === 'savingText')).toBe(true)
  })

  it('rejects drafts without valid dates', () => {
    const result = validateOfferDraft(
      {
        ...validDraft,
        validFrom: '',
        validTo: '',
      },
      {
        now: new Date('2026-07-01T12:00:00.000Z'),
      },
    )

    expect(result.accepted).toBe(false)
    expect(result.issues.some((issue) => issue.field === 'validFrom')).toBe(true)
    expect(result.issues.some((issue) => issue.field === 'validTo')).toBe(true)
  })

  it('matches retailer subdomains', () => {
    expect(isRetailerSourceUrl('https://www.clicks.co.za/Myclubcard-deals', ['https://clicks.co.za/clubcard'])).toBe(
      true,
    )
  })
})
