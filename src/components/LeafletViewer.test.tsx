import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StoreLeaflet } from '../types'
import { catalogueShareUrl } from '../services/catalogueShare'
import { LeafletViewer } from './LeafletViewer'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function leaflet(overrides: Partial<StoreLeaflet> = {}): StoreLeaflet {
  return {
    capturedAt: '2026-07-17T08:00:00.000Z',
    id: 'weekly-catalogue',
    name: 'Weekly catalogue',
    retailerId: 'shoprite',
    retailerName: 'Shoprite',
    url: 'https://official.test/catalogue',
    ...overrides,
  }
}

describe('LeafletViewer', () => {
  it('reads every page with controls, thumbnails, zoom, fallbacks, and keyboard navigation', () => {
    const onClose = vi.fn()
    const { container } = render(
      <LeafletViewer
        leaflet={leaflet({
          pages: [
            { fallbacks: ['https://cdn.test/page-1-fallback.jpg'], height: 1600, imageUrl: 'https://cdn.test/page-1.jpg', pageNumber: 1, width: 1100 },
            { height: 1600, imageUrl: 'https://cdn.test/page-2.jpg', pageNumber: 2, width: 1100 },
            { height: 1600, imageUrl: 'https://cdn.test/page-3.jpg', pageNumber: 3, width: 1100 },
          ],
        })}
        onClose={onClose}
      />,
    )

    expect(screen.getByText('Page 1 of 3')).toBeTruthy()
    const currentImage = screen.getByRole('img', { name: 'Shoprite catalogue page 1' }) as HTMLImageElement
    expect(currentImage.src).toBe('https://cdn.test/page-1.jpg')
    fireEvent.error(currentImage)
    expect(currentImage.src).toBe('https://cdn.test/page-1-fallback.jpg')

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Page 2 of 3')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Shoprite catalogue page 2' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByRole('button', { name: /Reset zoom to 100%/ }).textContent).toContain('125%')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(screen.getByRole('button', { name: /Reset zoom to 100%/ }).textContent).toContain('75%')
    fireEvent.click(screen.getByRole('button', { name: /Reset zoom to 100%/ }))
    expect(screen.getByRole('button', { name: /Reset zoom to 100%/ }).textContent).toContain('100%')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 3' }))
    expect(screen.getByText('Page 3 of 3')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reset zoom to 100%/ }).textContent).toContain('100%')
    for (let step = 0; step < 16; step += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    }
    expect(screen.getByRole('button', { name: /Reset zoom to 100%/ }).textContent).toContain('500%')
    expect((screen.getByRole('button', { name: 'Zoom in' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.keyDown(window, { key: 'Home' })
    expect(screen.getByText('Page 1 of 3')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'End' })
    expect(screen.getByText('Page 3 of 3')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText('Page 2 of 3')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('Page 3 of 3')).toBeTruthy()

    expect(container.querySelectorAll('.leaflet-page-thumbnail')).toHaveLength(3)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('embeds a PDF-only catalogue through the same-origin relay', () => {
    const { container } = render(
      <LeafletViewer
        leaflet={leaflet({
          documentUrl: 'https://official.test/catalogues/week-29.pdf',
          imageUrl: 'https://cdn.test/week-29-cover.jpg',
        })}
        onClose={vi.fn()}
      />,
    )

    const embed = container.querySelector('object')
    expect(embed?.getAttribute('type')).toBe('application/pdf')
    expect(embed?.getAttribute('data')).toBe(
      '/api/catalogue-file?u=https%3A%2F%2Fofficial.test%2Fcatalogues%2Fweek-29.pdf',
    )
    // Browsers that cannot show PDFs inline get the cover and a direct link.
    expect(
      (screen.getByRole('img', { name: 'Shoprite catalogue cover' }) as HTMLImageElement).src,
    ).toBe('https://cdn.test/week-29-cover.jpg')
    expect(
      screen.getByRole('link', { name: /Open the catalogue PDF/ }).getAttribute('href'),
    ).toBe('/api/catalogue-file?u=https%3A%2F%2Fofficial.test%2Fcatalogues%2Fweek-29.pdf')
    expect(screen.getByRole('link', { name: 'Official source' }).getAttribute('href')).toBe(
      'https://official.test/catalogue',
    )
  })

  it('uses the full PDF when the published pages only contain a cover preview', () => {
    const { container } = render(
      <LeafletViewer
        leaflet={leaflet({
          documentUrl: 'https://official.test/catalogues/week-29.pdf',
          pages: [
            { height: 1600, imageUrl: 'https://cdn.test/page-1.jpg', pageNumber: 1, width: 1100 },
          ],
        })}
        onClose={vi.fn()}
      />,
    )

    expect(container.querySelector('object')?.getAttribute('type')).toBe('application/pdf')
    expect(screen.queryByText('Page 1 of 1')).toBeNull()
  })

  it('retries a failing page image through the same-origin relay before giving up', () => {
    render(
      <LeafletViewer
        leaflet={leaflet({
          pages: [
            { height: 1600, imageUrl: 'https://cdn.test/page-1.jpg', pageNumber: 1, width: 1100 },
          ],
        })}
        onClose={vi.fn()}
      />,
    )

    const image = screen.getByRole('img', { name: 'Shoprite catalogue page 1' }) as HTMLImageElement
    expect(image.src).toBe('https://cdn.test/page-1.jpg')
    fireEvent.error(image)
    expect(image.src).toContain('/api/catalogue-file?u=https%3A%2F%2Fcdn.test%2Fpage-1.jpg')
    fireEvent.error(image)
    expect(screen.getByText('Page image unavailable')).toBeTruthy()
  })

  it('shows the cover when no pages or PDF are available', () => {
    render(
      <LeafletViewer
        leaflet={leaflet({ imageUrl: 'https://cdn.test/cover.jpg' })}
        onClose={vi.fn()}
      />,
    )

    expect((screen.getByRole('img', { name: 'Shoprite catalogue page 1' }) as HTMLImageElement).src)
      .toBe('https://cdn.test/cover.jpg')
  })

  it('loads every high-resolution directory page when the catalogue opens', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        pages: [
          {
            height: 2000,
            imageUrl: 'https://cdn.test/directory-page-1.webp',
            pageNumber: 1,
            width: 1410,
          },
          {
            height: 2000,
            imageUrl: 'https://cdn.test/directory-page-2.webp',
            pageNumber: 2,
            width: 1410,
          },
        ],
      },
    }), { headers: { 'content-type': 'application/json' } })))

    render(
      <LeafletViewer
        leaflet={leaflet({
          imageUrl: 'https://cdn.test/cover.webp',
          pages: [
            {
              height: 270,
              imageUrl: 'https://cdn.test/cover.webp',
              pageNumber: 1,
              width: 260,
            },
          ],
          pagesUrl:
            'https://trolleyscout.co.za/api/catalogue-pages?flyer=3703321&store=boxer',
          sourceLabel: 'Catalogue Specials',
        })}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Loading every catalogue page')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Page 1 of 2')).toBeTruthy())
    expect(screen.getByRole('link', { name: 'Catalogue source' })).toBeTruthy()
  })

  it('shares an exact Trolley Scout catalogue link', async () => {
    const share = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { share })
    const item = leaflet({
      id: 'latest-specials-123130',
      retailerId: 'food-lovers',
      sourceLabel: 'Latest Specials',
    })

    render(<LeafletViewer leaflet={item} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => expect(share).toHaveBeenCalledWith({
      text: 'Read Weekly catalogue from Shoprite on Trolley Scout.',
      title: 'Shoprite catalogue',
      url:
        'https://trolleyscout.co.za/deals?catalogue=latest-specials-123130&retailer=food-lovers',
    }))
    expect(screen.getByText('Catalogue shared.')).toBeTruthy()
    expect(catalogueShareUrl(item)).toContain('catalogue=latest-specials-123130')
  })
})
