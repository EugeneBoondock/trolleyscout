import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StoreLeaflet } from '../types'
import { LeafletViewer } from './LeafletViewer'

afterEach(cleanup)

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

  it('embeds a direct official PDF inside the modal', () => {
    const { container } = render(
      <LeafletViewer
        leaflet={leaflet({ documentUrl: 'https://official.test/catalogues/week-29.pdf' })}
        onClose={vi.fn()}
      />,
    )

    expect(container.querySelector('object')?.getAttribute('data')).toBe(
      'https://official.test/catalogues/week-29.pdf',
    )
    expect(screen.getByRole('link', { name: 'Official source' }).getAttribute('href')).toBe(
      'https://official.test/catalogue',
    )
  })

  it('shows the cover when no pages or PDF are available', () => {
    render(
      <LeafletViewer
        leaflet={leaflet({ imageUrl: 'https://cdn.test/cover.jpg' })}
        onClose={vi.fn()}
      />,
    )

    expect((screen.getByRole('img', { name: 'Shoprite catalogue cover' }) as HTMLImageElement).src)
      .toBe('https://cdn.test/cover.jpg')
  })
})
