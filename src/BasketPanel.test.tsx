import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BasketPanel } from './App'
import type { BasketResource, ResourceState } from './services/apiClient'
import type { BasketItem, SavedDeal } from './types'

function savedDeal(
  id: string,
  retailerId: SavedDeal['retailerId'],
  retailerName: string,
): SavedDeal {
  return {
    capturedAt: '2026-08-01T10:00:00.000Z',
    evidenceText: `${id} R20.00`,
    id: `deal-${id}`,
    priceText: 'R20.00',
    productUrl: `https://example.test/${id}`,
    retailerId,
    retailerName,
    savedAt: '2026-08-01T10:00:00.000Z',
    sourceLabel: 'Weekly offers',
    sourceUrl: `https://example.test/${retailerId}`,
    title: id,
  }
}

function basketItem(
  id: string,
  retailerId: SavedDeal['retailerId'],
  retailerName: string,
  quantity: number,
): BasketItem {
  return {
    addedAt: '2026-08-01T10:00:00.000Z',
    deal: savedDeal(id, retailerId, retailerName),
    id,
    linePriceCents: quantity * 2000,
    lineSavingCents: quantity * 300,
    quantity,
    savedDealId: `saved-${id}`,
    updatedAt: '2026-08-01T10:00:00.000Z',
  }
}

const basketState: ResourceState<BasketResource> = {
  data: {
    basket: {
      items: [
        basketItem('Bread', 'shoprite', 'Shoprite', 2),
        basketItem('Milk', 'checkers', 'Checkers', 1),
      ],
      summary: {
        itemCount: 3,
        knownPriceItemCount: 3,
        savingsCents: 900,
        totalCents: 6000,
      },
    },
  },
  message: 'Ready',
  meta: {
    generatedAt: '2026-08-01T10:00:00.000Z',
    source: 'cloudflare-pages',
  },
  status: 'ready',
}

describe('BasketPanel', () => {
  it('turns the basket into store stops with subtotals and a checklist', () => {
    document.documentElement.dataset.theme = 'dark'
    render(
      <BasketPanel
        basketState={basketState}
        onDeleteItem={vi.fn()}
        onReviewDeal={vi.fn()}
        onSetView={vi.fn()}
        onUpdateQuantity={vi.fn()}
      />,
    )

    expect(screen.getByText('Store stops').nextElementSibling).toHaveTextContent('2')
    expect(screen.getByRole('heading', { name: 'Checkers' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Shoprite' })).toBeInTheDocument()
    expect(screen.queryAllByText('R20.00 saved')).toHaveLength(0)
    expect(screen.getByText('0 of 2')).toBeInTheDocument()

    const checkersStop = screen.getByRole('heading', { name: 'Checkers' }).closest('section')
    expect(checkersStop).not.toBeNull()
    expect(within(checkersStop!).getByText('R20.00')).toBeInTheDocument()
    expect(within(checkersStop!).getByText(/saved$/)).toHaveTextContent('3,00 saved')

    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(screen.getByText('In trolley')).toBeInTheDocument()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
