import { describe, expect, it } from 'vitest'

import {
  buildScoutCartAction,
  hasCartIntent,
  namedRetailerId,
  requestedItems,
} from './scoutCartAction'
import type { ScoutChatDealCard } from '../../src/types'

const pnpBraaipack: ScoutChatDealCard = {
  id: 'pnp-braai',
  priceText: 'R199.99',
  productUrl: 'https://www.pnp.co.za/no-name-braaipack/p/12345',
  retailerName: 'Pick n Pay',
  title: 'No Name Frozen Chicken Braaipack 5kg',
}

const checkersBraaipack: ScoutChatDealCard = {
  id: 'checkers-braai',
  priceText: 'R229.99',
  productUrl: 'https://www.checkers.co.za/farmers-choice/p/54321',
  retailerName: 'Checkers',
  title: "Farmer's Choice Braaipack 5kg",
}

describe('buildScoutCartAction', () => {
  it('turns a cart request into something the agent can drive', () => {
    // This is the message that used to get "I can't add it to your cart".
    const action = buildScoutCartAction(
      'Add the cheapest 5kg chicken braai pack to my picknpay cart',
      [pnpBraaipack, checkersBraaipack],
    )

    expect(action?.retailerName).toBe('Pick n Pay')
    expect(action?.retailerId).toBe('pick-n-pay')
    expect(action?.items).toHaveLength(1)
    expect(action?.items[0].title).toBe('No Name Frozen Chicken Braaipack 5kg')
    expect(action?.items[0].productUrl).toContain('pnp.co.za')
    expect(action?.items[0].quantity).toBe(1)
  })

  it('fills the shop the shopper named, never a different one', () => {
    // Adding a Checkers product to a Pick n Pay request would be worse than
    // doing nothing. With no Pick n Pay deal to point at, it searches Pick n
    // Pay rather than reaching for the Checkers one.
    const action = buildScoutCartAction(
      'add the braai pack to my pnp basket',
      [checkersBraaipack],
    )

    expect(action?.retailerName).toBe('Pick n Pay')
    expect(action?.items[0].productUrl).toContain('pnp.co.za')
    expect(action?.items[0].searchTerm).toBe('braai pack')
  })

  it('searches a shop that has no deal feed at all', () => {
    // "Add a mcfeast burger to my Uber Eats" used to answer that it could not
    // find one, because no deal feed reaches the app from Uber Eats. The
    // agent drives a real browser, so it can just search the shop.
    const action = buildScoutCartAction(
      'add a mcfeast burger to my uber eats cart',
      [],
    )

    expect(action?.retailerName).toBe('Uber Eats')
    expect(action?.items[0].searchTerm).toBe('mcfeast burger')
    expect(action?.items[0].productUrl).toContain('ubereats.com')
    // No price, because there is none until the agent is on the shop's page.
    expect(action?.items[0].priceText).toBeUndefined()
  })

  it('offers nothing for a shop it cannot search and has no deal for', () => {
    expect(buildScoutCartAction('add bread to my cart', [])).toBeUndefined()
  })

  it('reads "cheapest" as cheapest, not as first-ranked', () => {
    const action = buildScoutCartAction(
      'add the cheapest braai pack to my cart',
      [checkersBraaipack, pnpBraaipack],
    )
    expect(action?.items[0].title).toBe('No Name Frozen Chicken Braaipack 5kg')
  })

  it('never lets an unreadable price win a cheapest request', () => {
    const action = buildScoutCartAction('add the cheapest one to my basket', [
      { ...checkersBraaipack, priceText: 'See in store' },
      pnpBraaipack,
    ])
    expect(action?.items[0].title).toBe('No Name Frozen Chicken Braaipack 5kg')
  })

  it('carries a quantity the shopper asked for', () => {
    expect(
      buildScoutCartAction('add 3x braai packs to my pnp cart', [pnpBraaipack])
        ?.items[0].quantity,
    ).toBe(3)
    expect(
      buildScoutCartAction('put 2 packs in my pnp trolley', [pnpBraaipack])
        ?.items[0].quantity,
    ).toBe(2)
  })

  it('ignores a question that is not a cart request', () => {
    expect(
      buildScoutCartAction('what is the cheapest braai pack?', [pnpBraaipack]),
    ).toBeUndefined()
  })

  it('offers nothing when no deal has a link to drive to', () => {
    expect(
      buildScoutCartAction('add it to my cart', [
        { ...pnpBraaipack, productUrl: 'not-a-url' },
      ]),
    ).toBeUndefined()
  })

  it('skips a sold-out product rather than opening a dead page', () => {
    expect(
      buildScoutCartAction('add it to my cart', [
        { ...pnpBraaipack, soldOut: true },
      ]),
    ).toBeUndefined()
  })
})

describe('named retailer', () => {
  it('picks out the shop the shopper named, in the id search uses', () => {
    expect(namedRetailerId('add basmati rice to my picknpay cart'))
      .toBe('pick-n-pay')
    expect(namedRetailerId('put milk in my Checkers basket')).toBe('checkers')
    expect(namedRetailerId('add panado to my dischem trolley')).toBe('dis-chem')
    expect(namedRetailerId('add rice to my cart')).toBeUndefined()
  })

  it('recognises a cart request even when it reads like a grocery list', () => {
    // This is what decides whether the shop's whole shelf is searched. Without
    // it the only basmati rice Mr Scout can see is basmati rice on special, so
    // it tells the shopper a shop that stocks it does not.
    expect(hasCartIntent('add basmati rice to my picknpay cart')).toBe(true)
    expect(hasCartIntent('put 2kg of rice in my trolley')).toBe(true)
    expect(hasCartIntent('what rice is cheapest?')).toBe(false)
  })
})

describe('a whole grocery list in one go', () => {
  const milk: ScoutChatDealCard = {
    id: 'pnp-milk',
    priceText: 'R24.99',
    productUrl: 'https://www.pnp.co.za/full-cream-milk-2l/p/1',
    retailerName: 'Pick n Pay',
    title: 'Clover Full Cream Milk 2L',
  }
  const bread: ScoutChatDealCard = {
    id: 'pnp-bread',
    priceText: 'R18.99',
    productUrl: 'https://www.pnp.co.za/white-bread/p/2',
    retailerName: 'Pick n Pay',
    title: 'Albany White Bread 700g',
  }
  const rice: ScoutChatDealCard = {
    id: 'pnp-rice',
    priceText: 'R89.99',
    productUrl: 'https://www.pnp.co.za/basmati-rice/p/3',
    retailerName: 'Pick n Pay',
    title: 'Spekko Basmati Rice 2kg',
  }
  const shelf = [milk, bread, rice, pnpBraaipack]

  it('adds every item the shopper listed, not just the first', () => {
    // The whole point: no going back and forth per item.
    const action = buildScoutCartAction(
      'add milk, bread and basmati rice to my picknpay cart',
      shelf,
    )

    expect(action?.items.map((item) => item.title)).toEqual([
      'Clover Full Cream Milk 2L',
      'Albany White Bread 700g',
      'Spekko Basmati Rice 2kg',
    ])
    expect(action?.retailerName).toBe('Pick n Pay')
  })

  it('keeps a per-item quantity from the item that carried it', () => {
    const action = buildScoutCartAction(
      'add 2x milk and bread to my pnp cart',
      shelf,
    )

    const quantities = Object.fromEntries(
      (action?.items ?? []).map((item) => [item.title, item.quantity]),
    )
    expect(quantities['Clover Full Cream Milk 2L']).toBe(2)
    expect(quantities['Albany White Bread 700g']).toBe(1)
  })

  it('never adds the same product twice for two similar phrases', () => {
    const action = buildScoutCartAction(
      'add milk and full cream milk to my pnp cart',
      shelf,
    )

    const urls = (action?.items ?? []).map((item) => item.productUrl)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('skips what the shop does not have and still adds the rest', () => {
    const action = buildScoutCartAction(
      'add milk, caviar and bread to my pnp cart',
      shelf,
    )

    expect(action?.items.map((item) => item.title)).toEqual([
      'Clover Full Cream Milk 2L',
      'Albany White Bread 700g',
    ])
  })

  it('will not hand over rice cakes to someone who asked for basmati rice',
    () => {
      // Half the phrase's words have to land, so one shared word is not a match.
      const cakes: ScoutChatDealCard = {
        ...rice,
        id: 'pnp-cakes',
        productUrl: 'https://www.pnp.co.za/rice-cakes/p/9',
        title: 'Rice Cakes Salted 150g',
      }
      const action = buildScoutCartAction(
        'add milk and basmati rice to my pnp cart',
        [milk, cakes],
      )

      expect(action?.items.map((item) => item.title)).toEqual([
        'Clover Full Cream Milk 2L',
      ])
    })

  it('still answers a single request with a single item', () => {
    const action = buildScoutCartAction('add milk to my pnp cart', shelf)
    expect(action?.items).toHaveLength(1)
  })

  it('reads the list without swallowing the shop name as a product', () => {
    expect(requestedItems('add milk, bread and rice to my picknpay cart'))
      .toEqual(['milk', 'bread', 'rice'])
    expect(requestedItems('add the cheapest 5kg chicken braai pack to my pnp cart'))
      .toEqual(['cheapest 5kg chicken braai pack'])
  })
})
