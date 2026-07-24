import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    expect(container.textContent).toContain('store prices across Zimbabwe')
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

describe('HomeView storefront', () => {
  it('keeps a single h1 so the heading order stays crawlable', () => {
    render(<HomeView onOpen={vi.fn()} />)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('opens the department a shopper picks', () => {
    const onOpen = vi.fn()
    render(<HomeView onOpen={onOpen} />)

    fireEvent.click(screen.getByRole('button', { name: /Store directory/ }))

    expect(onOpen).toHaveBeenCalledWith('sources')
  })

  it('links the Play badge to the published listing', () => {
    render(<HomeView onOpen={vi.fn()} />)
    const badge = screen.getByRole('link', { name: /Google Play/ })

    expect(badge.getAttribute('href')).toBe(
      'https://play.google.com/store/apps/details?id=za.co.trolleyscout.trolley_scout',
    )
    expect(badge.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('shows only the live counts it actually holds', () => {
    const { container } = render(
      <HomeView dealCount={0} onOpen={vi.fn()} retailerCount={17} sourceCount={64} />,
    )

    expect(container.textContent).toContain('Retailers in the directory')
    expect(container.textContent).toContain('Official source links')
    expect(container.textContent).not.toContain('Deals in this check')
    expect(container.textContent).not.toContain('Catalogues open now')
  })

  it('hides the figures board entirely when no counts have arrived', () => {
    const { container } = render(<HomeView onOpen={vi.fn()} />)

    expect(container.querySelector('.mall-figures')).toBeNull()
  })

  it('shows a deal price beside the was price and its retailer', () => {
    const deal: DiscoveredDeal = {
      capturedAt: '2026-07-16T10:00:00.000Z',
      evidenceText: 'Official source',
      id: 'oil-1',
      previousPriceText: 'R59.99',
      priceText: 'R44.99',
      productUrl: 'https://official.test/oil',
      retailerId: 'shoprite',
      retailerName: 'Shoprite',
      savingText: 'Save R15.00',
      sourceLabel: 'Official specials',
      sourceUrl: 'https://official.test/specials',
      title: 'Sunflower oil 2L',
    }

    render(<HomeView onOpen={vi.fn()} stapleDeals={[deal]} />)
    const tile = screen.getByRole('link', { name: /Sunflower oil 2L/ })

    expect(tile.getAttribute('href')).toBe('https://official.test/oil')
    expect(tile.textContent).toContain('R44.99')
    expect(tile.textContent).toContain('R59.99')
    expect(tile.textContent).toContain('Save R15.00')
  })

  it('never shows a was price that is not above the current price', () => {
    const deal: DiscoveredDeal = {
      capturedAt: '2026-07-16T10:00:00.000Z',
      evidenceText: 'Official source',
      id: 'milk-1',
      previousPriceText: 'R0.00',
      priceText: 'R21.99',
      productUrl: 'https://official.test/milk',
      retailerId: 'shoprite',
      retailerName: 'Shoprite',
      sourceLabel: 'Official specials',
      sourceUrl: 'https://official.test/specials',
      title: 'Full cream milk 2L',
    }

    const { container } = render(<HomeView onOpen={vi.fn()} stapleDeals={[deal]} />)

    expect(container.querySelector('.deal-tile-price s')).toBeNull()
  })
})
