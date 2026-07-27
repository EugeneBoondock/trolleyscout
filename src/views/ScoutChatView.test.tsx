import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScoutChatView } from './ScoutChatView'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ScoutChatView', () => {
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
