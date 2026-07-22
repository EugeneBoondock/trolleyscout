// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  preferredPortalPages,
  propertySearchCacheKey,
  propertyAreaTerms,
  selectNearMeLocation,
  shouldUsePropertyReader,
} from './propertyScout'
import type { Property24Location } from '../../src/services/propertyPortals'

describe('property search coverage', () => {
  it('fetches three pages from the two main portals on the first search', () => {
    expect(preferredPortalPages('property24', 1)).toEqual([1, 2, 3])
    expect(preferredPortalPages('privateproperty', 1)).toEqual([1, 2, 3])
    expect(preferredPortalPages('seeff', 1)).toEqual([1])
    expect(preferredPortalPages('property24', 2)).toEqual([2])
  })

  it('retries a suspiciously short direct response through the reader', () => {
    expect(shouldUsePropertyReader(2)).toBe(true)
    expect(shouldUsePropertyReader(12)).toBe(false)
  })

  it('uses the current search format so older broad-location cache rows are bypassed', () => {
    expect(propertySearchCacheKey('property24', 'rent', 'edenvale|gauteng', 1))
      .toBe('property-search-v2:property24:rent:edenvale|gauteng:1')
  })
})

describe('near-me location selection', () => {
  it('uses the first precise catalogue match before a later static neighbouring city', () => {
    const catalog: Property24Location[] = [
      {
        id: 1136,
        name: 'Hurlyvale',
        parentName: 'Edenvale',
        type: 1,
        normalizedName: 'hurlyvale',
        normalizedParentName: 'edenvale',
      },
    ]

    const result = selectNearMeLocation(['Hurlyvale', 'Kempton Park'], catalog, 'Gauteng')

    expect(result?.locationName).toBe('Hurlyvale')
    expect(result?.loc.p24?.id).toBe(1136)
  })

  it('includes child suburbs while keeping the precise neighbourhood first', () => {
    const catalog: Property24Location[] = [
      { id: 14, name: 'Edenvale', parentName: 'Gauteng', type: 2, normalizedName: 'edenvale' },
      { id: 606, name: 'Eden Glen', parentName: 'Edenvale', type: 1, normalizedName: 'edenglen' },
      { id: 607, name: 'Greenstone Hill', parentName: 'Edenvale', type: 1, normalizedName: 'greenstonehill' },
      { id: 5461, name: 'Greenstone Gate', parentName: 'Greenstone Hill', type: 13, normalizedName: 'greenstonegate' },
      { id: 12, name: 'Kempton Park', parentName: 'Gauteng', type: 2, normalizedName: 'kemptonpark' },
    ]

    expect(propertyAreaTerms(catalog, 'Edenvale', 'Eden Glen')).toEqual([
      'Eden Glen',
      'Edenvale',
      'Greenstone Hill',
      'Greenstone Gate',
    ])
  })
})
