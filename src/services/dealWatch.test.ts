import { describe, expect, it } from 'vitest'
import {
  dealMatchesWatch,
  findWatchMatches,
  isWatchQueryValid,
  normalizeWatchQuery,
} from './dealWatch'

describe('normalizeWatchQuery', () => {
  it('lowercases, strips punctuation, and drops stop words', () => {
    expect(normalizeWatchQuery('Peanut Butter, 1kg!')).toBe('peanut butter 1kg')
    expect(normalizeWatchQuery('Coffee and the Milk')).toBe('coffee milk')
  })

  it('caps runaway queries at eight tokens', () => {
    const long = Array.from({ length: 20 }, (_, i) => `token${i}`).join(' ')

    expect(normalizeWatchQuery(long).split(' ')).toHaveLength(8)
  })
})

describe('isWatchQueryValid', () => {
  it('needs at least one substantial token', () => {
    expect(isWatchQueryValid(normalizeWatchQuery('rice'))).toBe(true)
    expect(isWatchQueryValid(normalizeWatchQuery('1'))).toBe(false)
    expect(isWatchQueryValid(normalizeWatchQuery('!!'))).toBe(false)
  })
})

describe('dealMatchesWatch', () => {
  it('matches when every token starts a word in the title', () => {
    const query = normalizeWatchQuery('peanut butter')

    expect(dealMatchesWatch(query, 'Black Cat Peanut Butter Smooth 400g')).toBe(true)
    expect(dealMatchesWatch(query, 'Butter Croissants 4 pack')).toBe(false)
  })

  it('matches word prefixes but not word interiors', () => {
    expect(dealMatchesWatch('chick', 'Fresh Chicken Breasts 1kg')).toBe(true)
    expect(dealMatchesWatch('hen', 'Modern Kitchen Set')).toBe(false)
  })

  it('ignores punctuation in titles', () => {
    expect(dealMatchesWatch('coke 2l', 'Coca-Cola Coke (2L) Bottle')).toBe(true)
  })
})

describe('findWatchMatches', () => {
  const deals = [
    { priceText: 'R89.99', retailerName: 'Shoprite', title: 'Nescafe Coffee 200g' },
    { priceText: 'R94.99', retailerName: 'Checkers', title: 'Nescafe Gold Coffee 200g' },
    { priceText: 'R15.99', retailerName: 'PnP', title: 'Coffee Creamer 750g' },
    { priceText: 'R89.99', retailerName: 'Boxer', title: 'Nescafe Coffee 200g' },
  ]

  it('returns matching deals, deduped by title, capped at five', () => {
    const matches = findWatchMatches(normalizeWatchQuery('nescafe coffee'), deals)

    expect(matches).toHaveLength(2)
    expect(matches[0].retailerName).toBe('Shoprite')
  })

  it('returns empty for no match', () => {
    expect(findWatchMatches(normalizeWatchQuery('rooibos tea'), deals)).toHaveLength(0)
  })
})
