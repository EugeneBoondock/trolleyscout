import { describe, expect, test } from 'vitest'
import { parseProductQuery, scoreProductCandidate } from './productQuery'

function best(titles: readonly string[], raw: string): string | undefined {
  const query = parseProductQuery(raw)
  return titles
    .map((title) => ({ score: scoreProductCandidate(title, query), title }))
    .filter((entry) => !entry.score.rejected)
    .sort((left, right) => right.score.score - left.score.score)[0]?.title
}

function accepts(title: string, raw: string): boolean {
  return !scoreProductCandidate(title, parseProductQuery(raw)).rejected
}

describe('parseProductQuery', () => {
  test('reads the product, its size and the budget out of a sentence', () => {
    const query = parseProductQuery('cheap cordless drill under R2000')

    expect(query.headTerms).toContain('drill')
    expect(query.category).toBe('tools')
    expect(query.modifiers).toEqual(['cordless'])
    expect(query.priceCeilingCents).toBe(200_000)
    expect(query.sortCheapest).toBe(true)
  })

  test('understands screen size regardless of how it is written', () => {
    for (const raw of ['50 inch television', '50" TV', '50-inch tv', '50inch telly']) {
      expect(parseProductQuery(raw).spec.inches).toBe(50)
    }
  })

  test('separates appliance capacity from grocery pack size', () => {
    expect(parseProductQuery('washing machine 9kg').spec.capacity)
      .toEqual({ unit: 'kg', value: 9 })
    expect(parseProductQuery('milk 2L').spec.packSize)
      .toEqual({ unit: 'l', value: 2 })
  })

  test('sends retailers a short noun phrase, not the whole sentence', () => {
    expect(parseProductQuery('cheap cordless drill under R2000').storefrontQuery)
      .toBe('cordless drill')
  })

  test('prefers the longest known product name', () => {
    expect(parseProductQuery('outdoor pizza oven').headTerms).toContain('pizza oven')
  })
})

describe('scoreProductCandidate — the bug that made Mr Scout say "no results"', () => {
  test('a 50 inch TV matches "50 inch television" even when titled "TV"', () => {
    // The old every-token-substring filter rejected both of these because the
    // titles contain neither "inch" nor "television".
    expect(accepts('TCL QD GOOGLE TV 50S5K', '50 inch television')).toBe(true)
    expect(accepts('HISENSE 2K SMART QLED TV 50Q5S', '50 inch television')).toBe(true)
  })

  test('a differently sized TV is rejected, not merely ranked lower', () => {
    expect(accepts('TOSHIBA 55" UHD SMART TV 55C350MN', '50 inch television')).toBe(false)
  })

  test('the right size outranks a title that never states one', () => {
    expect(best(
      ['Hisense Smart LED TV', 'LEXUCO 50 Inch Smart LED TV'],
      '50 inch television',
    )).toBe('LEXUCO 50 Inch Smart LED TV')
  })
})

describe('scoreProductCandidate — wrong-product-type rejection', () => {
  test.each([
    ['2L Square Milk Canister - 10 Pack', 'milk 2L'],
    ['Milk Jug 2LT Straight Stainless Steel', 'milk 2L'],
    ['MAINSTAYS BREAD BIN STAINLESS STEEL', 'bread'],
    ['Bread Proofing Basket Sourdough Baking Supplies', 'bread'],
    ['ALANES Chicken Feeder Poultry Feeder No Waste', 'chicken'],
    ['Xiaomi Mi TV Stick Media Player', '50 inch television'],
    ['Rib Bike Short', 'kids bicycle 18 inch pink'],
    ['Ultra-Link 14-50 Inch Flat Tv Mount Bracket', '50 inch television'],
    ['Pizza Turning Peel Pizza Turner Metal Outdoor', 'outdoor pizza oven'],
  ])('rejects %j for %j', (title, query) => {
    expect(accepts(title, query)).toBe(false)
  })

  test('keeps the accessory when the shopper asked for one', () => {
    // "case" is a wrong type for a phone query but the whole point of this one.
    expect(accepts('HAMA CRYSTAL IPHONE 14 CASE CLEAR', 'iPhone 15 case clear')).toBe(true)
    expect(accepts('Magsafe Clear Case - Magnetic For Apple iPhone', 'iPhone 15 case clear'))
      .toBe(true)
  })

  test('does not confuse a colour word for the product', () => {
    expect(accepts('Liqui Fruit 100% Clear Apple Juice 1L', 'iPhone 15 case clear')).toBe(false)
  })
})

describe('scoreProductCandidate — size and budget', () => {
  test('an exact pack size beats a near miss', () => {
    expect(best(
      ['Clover Full Cream Milk 1L', 'PnP Full Cream Fresh Milk 2L'],
      'milk 2L',
    )).toBe('PnP Full Cream Fresh Milk 2L')
  })

  test('"2l" does not match the "2LT" inside another word', () => {
    const query = parseProductQuery('milk 2L')
    const loose = scoreProductCandidate('Full Cream Milk 12L Bulk', query)
    const exact = scoreProductCandidate('Full Cream Milk 2L', query)
    expect(exact.score).toBeGreaterThan(loose.score)
  })

  test('rejects anything over the stated budget', () => {
    const query = parseProductQuery('cordless drill under R2000')
    expect(scoreProductCandidate('DeWalt Cordless Drill 18V', query, 250_000).rejected).toBe(true)
    expect(scoreProductCandidate('DeWalt Cordless Drill 18V', query, 199_900).rejected).toBe(false)
  })

  test('a missing describing word costs the candidate rank', () => {
    expect(best(
      ['Schultz Power Tools Impact Drill 500W', 'RYOBI IMPACT DRILL CORDLESS 18V'],
      'cordless drill',
    )).toBe('RYOBI IMPACT DRILL CORDLESS 18V')
  })
})

describe('scoreProductCandidate — unknown products still work', () => {
  test('falls back to the head noun of the phrase', () => {
    expect(accepts('Wrought Iron Bunk Bed Frame', '3-tier bunk bed')).toBe(true)
    expect(accepts('Cadbury Dairy Milk Chocolate 80g', 'dairy milk chocolate')).toBe(true)
  })

  test('rejects a title with no product-type overlap at all', () => {
    expect(accepts('Sellotape Clear Tape 50m', 'bunk bed')).toBe(false)
  })
})
