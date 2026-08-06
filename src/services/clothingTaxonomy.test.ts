import { describe, expect, it } from 'vitest'

import {
  audienceFor,
  canTryOn,
  garmentTypeFor,
  isApparel,
} from './clothingTaxonomy'

describe('clothing taxonomy', () => {
  it('keeps homeware and hardware out of the fitting room', () => {
    expect(isApparel('Slim fit denim jeans')).toBe(true)
    expect(isApparel('Ladies floral dress')).toBe(true)
    expect(isApparel('Full length dressing mirror')).toBe(false)
    expect(isApparel('Duvet cover set queen')).toBe(false)
    expect(isApparel('Sherpa fleece blanket')).toBe(false)
    expect(isApparel('Fitted sheet white')).toBe(false)
    expect(isApparel('Signature premium walls and ceilings per coat per litre'))
      .toBe(false)
    expect(isApparel('Wooden clothes hangers 10 pack')).toBe(false)
  })

  it('reads who a garment is for, kids winning over gendered words', () => {
    expect(audienceFor('Boys school shirt')).toBe('kids')
    expect(audienceFor('Girls summer dress')).toBe('kids')
    expect(audienceFor('Ladies blouse')).toBe('women')
    expect(audienceFor('Mens chino pants')).toBe('men')
    expect(audienceFor('Cotton t-shirt')).toBe('any')
  })

  it('sorts garments into the shape a shopper filters by', () => {
    expect(garmentTypeFor('Denim jacket')).toBe('outerwear')
    expect(garmentTypeFor('Slim fit jeans')).toBe('bottoms')
    expect(garmentTypeFor('Canvas sneakers')).toBe('footwear')
    expect(garmentTypeFor('Floral maxi dress')).toBe('dresses')
    expect(garmentTypeFor('Cotton t-shirt')).toBe('tops')
    expect(garmentTypeFor('Leather belt')).toBe('accessories')
  })

  it('reads a sneaker cut as footwear, never as a shirt', () => {
    // "High Top" is a shoe. Tagged as a top it would offer a torso try-on
    // for something worn on the feet.
    expect(garmentTypeFor('Journey 2.0 High Top - Black & White')).toBe('footwear')
    expect(garmentTypeFor('Low Top Canvas')).toBe('footwear')
    expect(canTryOn(garmentTypeFor('Journey 2.0 High Top'))).toBe(false)
    // A genuine top still reads as one.
    expect(garmentTypeFor('Ribbed crop top')).toBe('tops')
  })

  it('offers try-on only for garments a model can dress a body in', () => {
    expect(canTryOn(garmentTypeFor('Cotton t-shirt'))).toBe(true)
    expect(canTryOn(garmentTypeFor('Denim jacket'))).toBe(true)
    expect(canTryOn(garmentTypeFor('Canvas sneakers'))).toBe(false)
    expect(canTryOn(garmentTypeFor('Leather belt'))).toBe(false)
  })

  it('agrees with the app on the same titles', () => {
    // These mirror mobile/test/clothing_filters_test.dart so the two sides of
    // the wire can never drift into different answers.
    expect(garmentTypeFor('Ladies floral dress')).toBe('dresses')
    expect(audienceFor('Ladies floral dress')).toBe('women')
    expect(isApparel('Full cream milk 2L')).toBe(false)
  })
})
