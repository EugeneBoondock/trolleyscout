import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { NearbyStoreResult } from '../services/apiClient'
import { saveNearbyHistorySearch } from '../services/nearbyHistory'
import { NearMeView } from './NearMeView'

const southAfricanStore: NearbyStoreResult = {
  address: 'A, B, Edenvale, Gauteng, 1609, South Africa',
  deals: [],
  distanceM: 100,
  lat: -26.14,
  leaflets: [],
  lon: 28.15,
  name: 'Edenvale Market',
  placeId: 'za-1',
  promotions: [],
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('NearMeView country changes', () => {
  it('clears stored results from the previous country', () => {
    saveNearbyHistorySearch(-26.14, 28.15, [southAfricanStore], 'ZA')

    const view = render(<NearMeView countryCode="ZA" />)
    expect(screen.getByText('Edenvale Market')).toBeTruthy()

    view.rerender(<NearMeView countryCode="ZW" />)
    expect(screen.queryByText('Edenvale Market')).toBeNull()
    expect(screen.queryByText('Edenvale')).toBeNull()
    expect(screen.getByText(/Find the supermarkets around you/)).toBeTruthy()
  })
})
