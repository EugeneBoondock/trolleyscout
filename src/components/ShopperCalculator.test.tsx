import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FloatingShopperCalculator, ShopperCalculatorSetting } from './ShopperCalculator'

describe('the shopper calculator', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(cleanup)

  it('appears after opt-in and tracks a discounted multi-pack trolley item', () => {
    render(
      <>
        <ShopperCalculatorSetting />
        <FloatingShopperCalculator />
      </>,
    )

    expect(screen.queryByRole('button', { name: 'Open shopper calculator' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Floating shopper calculator' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open shopper calculator' }))

    expect(screen.getByRole('dialog', { name: 'Shopper calculator' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Yoghurt pack' } })
    fireEvent.change(screen.getByLabelText('Shelf price'), { target: { value: '60.00' } })
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '20% off' }))
    expect(screen.getByText('Pay R48.00 each')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))

    expect(screen.getByText('Yoghurt pack')).toBeTruthy()
    expect(screen.getAllByText('R96.00')).toHaveLength(2)
  })
})
