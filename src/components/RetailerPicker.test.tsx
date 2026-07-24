import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RetailerPicker, type RetailerPickerOption } from './RetailerPicker'

afterEach(cleanup)

const options: RetailerPickerOption[] = [
  { count: 12, id: 'checkers', name: 'Checkers' },
  { count: 9, id: 'pick-n-pay', name: 'Pick n Pay' },
  { count: 7, id: 'woolworths', name: 'Woolworths' },
  { count: 5, id: 'shoprite', name: 'Shoprite' },
  { count: 4, id: 'spar', name: 'SPAR' },
  { count: 3, id: 'makro', name: 'Makro' },
  { count: 2, id: 'game', name: 'Game' },
  { count: 1, id: 'cafe-fresh', name: 'Café Fresh' },
]
const totalCount = options.reduce((sum, option) => sum + option.count, 0)

function renderPicker(overrides: Partial<Parameters<typeof RetailerPicker>[0]> = {}) {
  const onChange = vi.fn()
  render(
    <RetailerPicker
      onChange={onChange}
      options={options}
      totalCount={totalCount}
      value="all"
      {...overrides}
    />,
  )

  return { onChange }
}

function openPanel(triggerName: RegExp = /All retailers/i) {
  const trigger = screen.getByRole('button', { name: triggerName })
  fireEvent.click(trigger)
  return { search: screen.getByRole('combobox'), trigger }
}

function openPanelListbox() {
  openPanel()
  return screen.getByRole('listbox')
}

describe('RetailerPicker', () => {
  it('opens the panel from the trigger and focuses the search field', () => {
    renderPicker()
    expect(screen.queryByRole('listbox')).toBeNull()

    const { search } = openPanel()

    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(document.activeElement).toBe(search)
  })

  it('renders deal counts on the trigger and on every row', () => {
    renderPicker()
    const trigger = screen.getByRole('button', { name: /All retailers/i })

    expect(within(trigger).getByText(String(totalCount))).toBeTruthy()

    const listbox = openPanelListbox()
    expect(within(listbox).getByRole('option', { name: `All retailers, ${totalCount} deals` })).toBeTruthy()
    expect(within(listbox).getByRole('option', { name: 'Checkers, 12 deals' })).toBeTruthy()
    expect(within(listbox).getByRole('option', { name: 'Café Fresh, 1 deal' })).toBeTruthy()
  })

  it('groups the busiest stores first and the rest under A-Z headings', () => {
    renderPicker()
    const listbox = openPanelListbox()

    expect(within(listbox).getByText('Most deals')).toBeTruthy()
    // Game and Café Fresh fall outside the top six, so they land in A-Z.
    expect(within(listbox).getByText('G')).toBeTruthy()
    expect(within(listbox).getByText('C')).toBeTruthy()
  })

  it('filters the list as the shopper types, ignoring case and accents', () => {
    renderPicker()
    const { search } = openPanel()

    fireEvent.change(search, { target: { value: 'cafe' } })

    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getByRole('option', { name: /Café Fresh/ })).toBeTruthy()
    expect(within(listbox).queryByRole('option', { name: /Checkers/ })).toBeNull()
    expect(within(listbox).queryByRole('option', { name: /All retailers/ })).toBeNull()
  })

  it('shows a friendly empty state with the query and a way to clear it', () => {
    renderPicker()
    const { search } = openPanel()

    fireEvent.change(search, { target: { value: 'zzz supermarket' } })

    expect(screen.getByText(/No store matches/)).toBeTruthy()
    expect(screen.getByText(/zzz supermarket/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(screen.queryByText(/No store matches/)).toBeNull()
    expect(screen.getByRole('option', { name: /Checkers/ })).toBeTruthy()
  })

  it('explains an empty catalogue instead of showing a bare list', () => {
    renderPicker({ options: [], totalCount: 0 })
    openPanel()

    expect(screen.getByText(/No stores have deals yet/)).toBeTruthy()
    expect(screen.queryByText(/No store matches/)).toBeNull()
  })

  it('reports the chosen store and closes the panel', () => {
    const { onChange } = renderPicker()
    openPanel()

    fireEvent.click(screen.getByRole('option', { name: /Shoprite/ }))

    expect(onChange).toHaveBeenCalledWith('shoprite')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('resets to every retailer from the pinned first row', () => {
    const { onChange } = renderPicker({ value: 'checkers' })
    openPanel(/Checkers/i)

    fireEvent.click(screen.getByRole('option', { name: /All retailers/ }))

    expect(onChange).toHaveBeenCalledWith('all')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('opens on the current selection and moves through rows with the arrow keys', () => {
    const { onChange } = renderPicker({ value: 'woolworths' })
    const { search } = openPanel(/Woolworths/i)

    const selected = screen.getByRole('option', { name: /Woolworths/ })
    expect(search.getAttribute('aria-activedescendant')).toBe(selected.getAttribute('id'))

    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith('shoprite')
  })

  it('closes on Escape and hands focus back to the trigger', () => {
    renderPicker()
    const { search, trigger } = openPanel()

    fireEvent.keyDown(search, { key: 'Escape' })

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps Tab cycling inside the open panel', () => {
    renderPicker()
    const { search } = openPanel()

    // The search field is the only stop until a query reveals the clear control.
    fireEvent.keyDown(search, { key: 'Tab' })
    expect(document.activeElement).toBe(search)

    fireEvent.change(search, { target: { value: 'ch' } })
    const clear = screen.getByRole('button', { name: 'Clear the store search' })

    clear.focus()
    fireEvent.keyDown(clear, { key: 'Tab' })
    expect(document.activeElement).toBe(search)

    fireEvent.keyDown(search, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(clear)
  })

  it('closes when the shopper clicks away', () => {
    renderPicker()
    openPanel()

    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
