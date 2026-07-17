/// <reference types="node" />

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { DiscoveredStoreDirectory } from './App'
import type { DiscoveredStoresResource } from './services/apiClient'

afterEach(cleanup)

const resource: DiscoveredStoresResource = {
  stores: [
    {
      address: '1 Main Road, Cape Town',
      deals: [],
      lastSeenAt: '2026-07-16T08:00:00.000Z',
      lat: -33.9,
      leaflets: [],
      lon: 18.4,
      name: 'Pick n Pay Central',
      placeId: 'pnp-central',
      promotionCount: 1,
      promotions: [{
        id: 'rice',
        imageUrl: 'https://official.test/rice.jpg',
        kind: 'deal',
        priceText: 'R29.99',
        sourceUrl: 'https://official.test/rice',
        title: 'Rice 2kg',
      }],
      retailerId: 'pick-n-pay',
      website: 'https://www.pnp.co.za/store-central',
    },
    {
      address: '2 Oak Road, Cape Town',
      deals: [],
      lastSeenAt: '2026-07-15T08:00:00.000Z',
      lat: -33.8,
      leaflets: [],
      lon: 18.5,
      name: 'Pick n Pay North',
      placeId: 'pnp-north',
      promotionCount: 1,
      promotions: [{
        id: 'weekly-catalogue',
        imageUrl: 'https://official.test/catalogue.jpg',
        kind: 'catalogue',
        productUrl: 'https://official.test/weekly-catalogue.pdf',
        sourceUrl: 'https://official.test/catalogue',
        title: 'Weekly catalogue',
        validTo: '2026-07-20',
      }],
      retailerId: 'pick-n-pay',
      website: 'https://www.pnp.co.za/store-north',
    },
  ],
  summary: { areaCount: 2, knownChainCount: 2, storeCount: 2, withPromotionsCount: 2 },
}

describe('DiscoveredStoreDirectory', () => {
  it('opens one grouped retailer card and keeps branch-specific promotions distinct', () => {
    render(<DiscoveredStoreDirectory discovered={resource} />)

    const groupButton = screen.getByRole('button', { name: /Pick n Pay.*2 locations/i })
    expect(screen.getAllByRole('button', { name: /Pick n Pay.*locations/i })).toHaveLength(1)

    fireEvent.click(groupButton)
    const dialog = screen.getByRole('dialog', { name: /Pick n Pay locations/i })
    expect(within(dialog).getByText('1 Main Road, Cape Town')).toBeTruthy()
    expect(within(dialog).getByText('2 Oak Road, Cape Town')).toBeTruthy()
    expect(within(dialog).getByRole('heading', { name: 'Pick n Pay Central' })).toBeTruthy()
    expect(within(dialog).getByRole('heading', { name: 'Pick n Pay North' })).toBeTruthy()
    expect(within(dialog).getByText('Rice 2kg')).toBeTruthy()
    expect(within(dialog).getByText('R29.99')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: /Read Weekly catalogue here/i })).toBeTruthy()
  })

  it('opens catalogue promotions in the in-platform leaflet viewer and closes on Escape', () => {
    const { container } = render(<DiscoveredStoreDirectory discovered={resource} />)
    fireEvent.click(screen.getByRole('button', { name: /Pick n Pay.*2 locations/i }))
    fireEvent.click(screen.getByRole('button', { name: /Read Weekly catalogue here/i }))

    expect(screen.getByRole('dialog', { name: 'Weekly catalogue' })).toBeTruthy()
    expect(container.querySelector('object')?.getAttribute('data')).toBe(
      'https://official.test/weekly-catalogue.pdf',
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Weekly catalogue' })).toBeNull()
  })

  it('renders every retailer group in the national directory', () => {
    const stores = Array.from({ length: 61 }, (_, index) => ({
      deals: [],
      lat: -30 + index / 100,
      leaflets: [],
      lon: 25,
      name: `Independent store ${index + 1}`,
      placeId: `independent-${index + 1}`,
      promotionCount: 0,
      promotions: [],
    }))

    render(
      <DiscoveredStoreDirectory
        discovered={{
          stores,
          summary: { areaCount: 61, knownChainCount: 0, storeCount: 61, withPromotionsCount: 0 },
        }}
      />,
    )

    expect(screen.getAllByRole('button', { name: /1 location, 0 live promotions/i })).toHaveLength(61)
  })
})

it('hides the member menu toggle above mobile width and restores it on mobile', () => {
  const appCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

  expect(appCss).toMatch(/#member-menu\s*{[^}]*display:\s*none/s)
  expect(appCss).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*#member-menu\s*{[^}]*display:\s*inline-grid/s)
})
