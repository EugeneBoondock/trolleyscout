import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PropertiesView } from './PropertiesView'
import type { MemberAccount, PropertyListing } from '../types'

const account = { propertiesAccess: true } as MemberAccount

const listing: PropertyListing & { savedAt: number } = {
  id: '111',
  portal: 'gumtree',
  portalName: 'Gumtree',
  title: '3 Bed House in Claremont',
  priceText: 'R 2,650,000',
  priceValue: 2650000,
  location: 'Claremont, Cape Town',
  bedrooms: 3,
  bathrooms: 2,
  imageUrl: 'https://img/1.jpg',
  images: ['https://img/1.jpg', 'https://img/2.jpg', 'https://img/3.jpg'],
  listingUrl: 'https://www.gumtree.co.za/a/111',
  listingType: 'sale',
  savedAt: 1_700_000_000_000,
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('PropertiesView saved homes', () => {
  it('shows a saved home with a swipeable gallery and toggles off', () => {
    localStorage.setItem('ts_saved_properties_v1', JSON.stringify([listing]))
    render(<PropertiesView account={account} onUpgrade={() => {}} />)

    // Switch to the Saved view.
    fireEvent.click(screen.getByRole('tab', { name: /Saved/ }))

    expect(screen.getByText('1 saved home')).toBeTruthy()
    expect(screen.getByText('3 Bed House in Claremont')).toBeTruthy()
    // Jakob's Law feature row: bed/bath figures each carry a screen-reader label.
    expect(screen.getByLabelText('3 bedrooms')).toBeTruthy()
    expect(screen.getByLabelText('2 bathrooms')).toBeTruthy()
    // Gallery renders one <img> per image, plus a photo counter.
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(screen.getByText('1/3')).toBeTruthy()
    // View link points at the portal listing.
    const view = screen.getByRole('link', { name: /View on Gumtree/ }) as HTMLAnchorElement
    expect(view.href).toBe('https://www.gumtree.co.za/a/111')

    // The save button is pressed (this home is saved); un-save removes it.
    const save = screen.getByRole('button', { name: /Remove from saved/ })
    expect(save.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(save)
    expect(screen.getByText('No saved homes yet')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('ts_saved_properties_v1') ?? '[]')).toHaveLength(0)
  })

  it('shows the upsell when the member lacks access', () => {
    render(<PropertiesView account={{ propertiesAccess: false } as MemberAccount} onUpgrade={() => {}} />)
    expect(screen.getByText('Upgrade to Household')).toBeTruthy()
  })
})
