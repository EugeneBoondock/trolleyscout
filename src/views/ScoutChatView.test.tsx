import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScoutChatView } from './ScoutChatView'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe('the Mr Scout cart', () => {
  // The cart is deliberately persistent, so each test starts from an empty one.
  beforeEach(() => globalThis.localStorage?.clear())

  const sendMessage = vi.fn(async () => ({
    reply: 'Takealot has a 50 inch Hisense.',
    deals: [{
      id: 'live:0:takealot',
      priceText: 'R6099.00',
      productUrl: 'https://www.takealot.com/hisense-50/PLID1',
      retailerName: 'Takealot',
      title: 'Hisense 50 Inch QLED Smart TV',
    }],
    catalogues: [],
    followUps: [],
  }))

  async function askAndAdd() {
    render(<ScoutChatView sendMessage={sendMessage} />)
    fireEvent.change(screen.getByLabelText('Message Mr Scout'), {
      target: { value: '50 inch television' },
    })
    fireEvent.submit(screen.getByLabelText('Message Mr Scout').closest('form')!)
    const addButton = await screen.findByLabelText(
      'Add Hisense 50 Inch QLED Smart TV to your Mr Scout cart',
    )
    fireEvent.click(addButton)
  }

  it('adds a product card to the cart and counts it in the header', async () => {
    await askAndAdd()

    await waitFor(() => {
      expect(screen.getByLabelText('Mr Scout cart, 1 item')).toBeTruthy()
    })
    expect(screen.getByLabelText(
      'Remove Hisense 50 Inch QLED Smart TV from your Mr Scout cart',
    )).toBeTruthy()
  })

  it('shows the total and a per-store breakdown so the trip can be split', async () => {
    await askAndAdd()
    fireEvent.click(screen.getByLabelText('Mr Scout cart, 1 item'))

    const panel = screen.getByLabelText('Mr Scout cart')
    expect(panel.textContent).toContain('Takealot')
    expect(panel.textContent).toContain('R6099.00')
    expect(screen.getByRole('link', { name: 'Shop Takealot with Mr Scout' }))
      .toBeTruthy()
    expect(panel.textContent).toContain('same browser session')
    expect(screen.getByRole('button', { name: 'Add all to basket' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy()
  })

  it('empties on clear', async () => {
    await askAndAdd()
    fireEvent.click(screen.getByLabelText('Mr Scout cart, 1 item'))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Mr Scout cart').textContent)
        .toContain('Nothing here yet')
    })
  })
})

describe('ScoutChatView', () => {
  it('keeps a separate editable grocery list behind a counted planner control', async () => {
    const transferItem = vi.fn(async () => undefined)
    const sendMessage = vi.fn(async () => ({
      reply: 'I built a temporary grocery list.',
      deals: [],
      catalogues: [],
      followUps: [],
      groceryPlan: {
        assumptions: ['2 people', 'One planning period'],
        currencyCode: 'ZAR',
        items: [
          {
            assumption: 'Staple for a household of 2',
            group: 'Staple',
            id: 'rice',
            imageUrl: 'https://images.test/rice.webp',
            lineTotalCents: 4500,
            lineTotalText: 'R45.00',
            priceText: 'R45.00',
            productUrl: 'https://retailer.test/rice',
            promotionText: 'Save R10',
            quantity: 1,
            retailerId: 'market-a',
            retailerName: 'Market A',
            sourceUrl: 'https://retailer.test/specials',
            title: 'Long grain rice 2kg',
            unitPriceCents: 4500,
          },
          {
            assumption: 'Plant protein for a household of 2',
            group: 'Plant protein',
            id: 'tofu',
            lineTotalCents: 3800,
            lineTotalText: 'R38.00',
            priceText: 'R38.00',
            productUrl: 'https://retailer.test/tofu',
            quantity: 1,
            retailerId: 'market-b',
            retailerName: 'Market B',
            sourceUrl: 'https://retailer.test/specials',
            title: 'Firm tofu 300g',
            unitPriceCents: 3800,
          },
        ],
        maxStores: 3,
        missingItems: ['Fresh fruit'],
        storeCount: 2,
        subtotalCents: 8300,
        subtotalText: 'R83.00',
        totalCents: 8300,
        totalText: 'R83.00',
        tradeOffs: ['Two stores are used for better coverage.'],
      },
    }))
    render(<ScoutChatView onTransferItem={transferItem} sendMessage={sendMessage} />)

    expect(screen.getByRole('button', { name: 'Open grocery list, 0 items' }))
      .toBeTruthy()
    fireEvent.change(screen.getByLabelText('Message Mr Scout'), {
      target: { value: 'Create a grocery list for vegan food' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open grocery list, 2 items' }))
        .toBeTruthy(),
    )
    expect(transferItem).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Open grocery list, 2 items' }))
    expect(screen.getByRole('dialog', { name: 'Temporary grocery list' })).toBeTruthy()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close grocery list' }),
    )
    expect(screen.getByText('Market A')).toBeTruthy()
    expect(screen.getByText('Market B')).toBeTruthy()
    expect(screen.getByText('Long grain rice 2kg')).toBeTruthy()
    expect(screen.getByText('Save R10')).toBeTruthy()
    expect(screen.getByText('Fresh fruit')).toBeTruthy()
    expect(screen.getAllByText('R83.00')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Increase Long grain rice 2kg quantity' }))
    expect(screen.getAllByText('R128.00')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Transfer Long grain rice 2kg to main basket' }))
    await waitFor(() =>
      expect(transferItem).toHaveBeenCalledWith(expect.objectContaining({
        id: 'rice',
        quantity: 2,
      })),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove Firm tofu 300g' }))
    expect(screen.getByRole('button', { name: 'Open grocery list, 1 item' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save grocery list' }))
    expect(window.localStorage.getItem('trolley-scout-grocery-plan-v1')).toContain('rice')
    fireEvent.click(screen.getByRole('button', { name: 'Clear grocery list' }))
    expect(screen.getByText('Your temporary grocery list is empty.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open grocery list, 0 items' }))
      .toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Temporary grocery list' }))
      .toBeNull()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Open grocery list, 0 items' }),
      ),
    )
  })

  it('sends a message and renders deal and catalogue cards from Mr Scout', async () => {
    const sendMessage = vi.fn(async () => ({
      reply: 'I found a coffee deal and this week’s catalogue.',
      deals: [{
        id: 'deal-1',
        imageUrl: 'https://images.test/coffee.webp',
        priceText: 'R79.99',
        productUrl: 'https://retailer.test/coffee',
        retailerName: 'Checkers',
        title: 'Ground coffee',
      }],
      catalogues: [{
        id: 'catalogue-1',
        imageUrl: 'https://images.test/catalogue.webp',
        name: 'Weekly catalogue',
        pageCount: 2,
        pageImageUrls: [
          'https://images.test/page-1.webp',
          'https://images.test/page-2.webp',
        ],
        retailerName: 'Checkers',
        url: 'https://retailer.test/catalogue',
      }],
      followUps: ['Show tea deals'],
    }))
    render(<ScoutChatView sendMessage={sendMessage} />)

    fireEvent.change(screen.getByLabelText('Message Mr Scout'), {
      target: { value: 'Find coffee' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(screen.getByText('Ground coffee')).toBeTruthy())
    expect(screen.getByText('R79.99')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View Ground coffee' }).getAttribute('href'))
      .toContain('https://retailer.test/coffee')
    expect(screen.getByRole('button', { name: 'Read Weekly catalogue' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Read Weekly catalogue' }))
    expect(screen.getByRole('dialog', { name: 'Weekly catalogue' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Checkers catalogue page 1' })).toBeTruthy()
  })

  it('loads all remote pages for a catalogue card that only carries its cover', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        pages: [
          {
            imageUrl: 'https://images.test/page-1.webp',
            pageNumber: 1,
          },
          {
            imageUrl: 'https://images.test/page-2.webp',
            pageNumber: 2,
          },
        ],
      },
    }), { headers: { 'content-type': 'application/json' } })))
    const sendMessage = vi.fn(async () => ({
      reply: 'Open the full catalogue.',
      deals: [],
      catalogues: [{
        id: 'catalogue-remote',
        imageUrl: 'https://images.test/cover.webp',
        name: 'Full weekly catalogue',
        pageCount: 0,
        pageImageUrls: ['https://images.test/cover.webp'],
        pagesUrl: 'https://trolleyscout.co.za/api/catalogue-pages?flyer=3703321',
        retailerName: 'Boxer',
        url: 'https://retailer.test/catalogue',
      }],
      followUps: [],
    }))
    render(<ScoutChatView sendMessage={sendMessage} />)

    fireEvent.change(screen.getByLabelText('Message Mr Scout'), {
      target: { value: 'Show Boxer catalogues' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(screen.getByText('Full weekly catalogue')).toBeTruthy())
    expect(screen.getByText('Open catalogue')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Read Full weekly catalogue' }))
    expect(screen.getByText('Loading every catalogue page')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Page 1 of 2')).toBeTruthy())
  })
})

