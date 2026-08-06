import { describe, expect, it } from 'vitest'

import {
  buildScoutCartAction,
  hasCartIntent,
  namedRetailerId,
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
    // doing nothing.
    expect(
      buildScoutCartAction('add the braai pack to my pnp basket', [
        checkersBraaipack,
      ]),
    ).toBeUndefined()
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
