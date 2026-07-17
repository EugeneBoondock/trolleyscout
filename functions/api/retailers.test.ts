import { describe, expect, it } from 'vitest'
import { addRetailerLogos } from './retailers'

describe('addRetailerLogos', () => {
  it('adds a favicon URL based on an official source website', () => {
    const retailers = addRetailerLogos([
      {
        accentColor: '#000000',
        group: 'Supermarket',
        id: 'shoprite',
        name: 'Shoprite',
        program: 'Xtra Savings',
        shortName: 'Shoprite',
        sourceNote: 'Official',
        sources: [{ kind: 'specials', label: 'Specials', url: 'https://www.shoprite.co.za/specials.html' }],
        verifiedOn: '2026-07-16',
      },
    ])

    expect(retailers[0].logoUrl).toBe('https://icons.duckduckgo.com/ip3/shoprite.co.za.ico')
  })
})
