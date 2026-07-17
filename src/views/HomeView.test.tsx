import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DiscoveredDeal } from '../types'
import { HomeView } from './HomeView'

afterEach(cleanup)

describe('HomeView punctuation', () => {
  it('never renders an em dash, including one received in deal data', () => {
    const deal: DiscoveredDeal = {
      capturedAt: '2026-07-16T10:00:00.000Z',
      evidenceText: 'Official source',
      id: 'rice-1',
      priceText: 'R29.99',
      productUrl: 'https://official.test/rice',
      retailerId: 'shoprite',
      retailerName: 'Shoprite — Gauteng',
      sourceLabel: 'Official specials',
      sourceUrl: 'https://official.test/specials',
      title: 'Rice 2kg — save R10',
    }

    const { container } = render(<HomeView onOpen={vi.fn()} stapleDeals={[deal]} />)

    expect(container.textContent).not.toContain('—')
    expect(container.textContent).toContain('Rice 2kg: save R10')
  })
})
