import { describe, expect, it } from 'vitest'

import {
  parseScoutSearchIntent,
  productQueryFromIntent,
  scoutSearchIntentSchema,
} from './scoutSearchIntent'

function responsePayload(value: unknown): unknown {
  return {
    output: [{
      type: 'message',
      content: [{
        type: 'output_text',
        text: JSON.stringify(value),
      }],
    }],
  }
}

describe('parseScoutSearchIntent', () => {
  it('preserves a corrected product identity from a natural request', () => {
    const intent = parseScoutSearchIntent(responsePayload({
      kind: 'product',
      productName: 'Air Force sneakers',
      productTerms: ['air', 'force', 'sneaker'],
      requestedPackGrams: null,
      requestedPackText: null,
      sort: 'price-asc',
    }))

    expect(intent).toEqual({
      kind: 'product',
      productName: 'Air Force sneakers',
      productTerms: ['air', 'force', 'sneaker'],
      requestedPackGrams: null,
      requestedPackText: null,
      sort: 'price-asc',
    })
    expect(productQueryFromIntent(intent)).toEqual({
      productName: 'Air Force sneakers',
      productTerms: ['air', 'force', 'sneaker'],
      sort: 'price-asc',
    })
  })

  it('keeps non-product requests out of Marketplace product retrieval', () => {
    const intent = parseScoutSearchIntent(responsePayload({
      kind: 'catalogue',
      productName: '',
      productTerms: [],
      requestedPackGrams: null,
      requestedPackText: null,
      sort: 'relevance',
    }))

    expect(productQueryFromIntent(intent)).toBeUndefined()
  })

  it('normalizes model phrases and plurals into title-matching terms', () => {
    const intent = parseScoutSearchIntent(responsePayload({
      kind: 'product',
      productName: 'Air Force sneakers',
      productTerms: ['air force', 'sneakers'],
      requestedPackGrams: null,
      requestedPackText: null,
      sort: 'price-asc',
    }))

    expect(intent.productTerms).toEqual(['air', 'force', 'sneaker'])
  })

  it('rejects malformed product intent instead of issuing a broad search', () => {
    expect(() => parseScoutSearchIntent(responsePayload({
      kind: 'product',
      productName: '',
      productTerms: [],
      requestedPackGrams: null,
      requestedPackText: null,
      sort: 'relevance',
    }))).toThrow('product name')
  })
})

describe('scoutSearchIntentSchema', () => {
  it('requires every structured retrieval field', () => {
    expect(scoutSearchIntentSchema.required).toEqual([
      'kind',
      'productName',
      'productTerms',
      'requestedPackGrams',
      'requestedPackText',
      'sort',
    ])
    expect(scoutSearchIntentSchema.additionalProperties).toBe(false)
  })
})
