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

  it('shows country-matched shopping copy without country-specific support content', () => {
    const { container } = render(
      <HomeView
        country={{ code: 'ZW', currencyCode: 'ZWG', flag: '🇿🇼', name: 'Zimbabwe' }}
        onOpen={vi.fn()}
      />,
    )

    expect(container.textContent).toContain('For households in Zimbabwe')
    expect(container.textContent).toContain('property platforms for Zimbabwe')
    expect(container.textContent).toContain('Find grocery deals')
    expect(container.textContent).not.toContain('SASSA')
    expect(container.textContent).not.toContain('Money help')
  })

  it('uses the branded shopping hero and current comparison wording', () => {
    const { container } = render(<HomeView onOpen={vi.fn()} />)
    const heroImage = container.querySelector<HTMLImageElement>('.home-hero-media img')

    expect(heroImage?.getAttribute('src')).toBe('/trolley-scout-hero-shopping.jpg')
    expect(heroImage?.getAttribute('alt')).toContain('comparing grocery prices')
    expect(container.textContent).toContain('Compare store prices')
    expect(container.textContent).not.toContain('Compare pack prices')
    expect(container.textContent).not.toContain('two pack prices')
  })
})
