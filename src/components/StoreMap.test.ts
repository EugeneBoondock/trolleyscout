import { describe, expect, it } from 'vitest'

import { storeNavigationUrl } from '../services/storeNavigation'

describe('storeNavigationUrl', () => {
  it('builds a global turn-by-turn navigation link', () => {
    expect(storeNavigationUrl(-33.9249, 18.4241)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-33.9249%2C18.4241&travelmode=driving',
    )
  })
})
