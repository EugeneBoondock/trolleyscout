import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ScoutGuide, ScoutMascot } from './ScoutMascot'

beforeEach(() => window.sessionStorage.clear())
afterEach(cleanup)

describe('ScoutMascot', () => {
  it('selects the requested original pose and stays decorative by default', () => {
    const { container } = render(<ScoutMascot pose="search" />)
    const image = container.querySelector('img')

    expect(image?.getAttribute('src')).toBe('/mascots/scout-search.png')
    expect(image?.getAttribute('alt')).toBe('')
  })

  it('can expose an accessible label when the character carries meaning', () => {
    render(<ScoutMascot label="Scout is ready to help" pose="wave" />)

    expect(screen.getByRole('img', { name: 'Scout is ready to help' })).toBeTruthy()
  })
})

describe('ScoutGuide', () => {
  it('pops up with contextual advice once per view in a browser session', async () => {
    const { rerender } = render(<ScoutGuide delayMs={0} view="discovery" />)

    expect(await screen.findByText('A quicker deal search')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Scout’s tip' }))
    expect(screen.queryByText('A quicker deal search')).toBeNull()

    rerender(<ScoutGuide delayMs={0} view="home" />)
    expect(await screen.findByText('Meet Scout')).toBeTruthy()

    rerender(<ScoutGuide delayMs={0} view="discovery" />)
    await waitFor(() => expect(screen.queryByText('A quicker deal search')).toBeNull())
  })

  it('stays out of views without a useful tip', () => {
    render(<ScoutGuide delayMs={0} view="privacy" />)

    expect(screen.queryByRole('status')).toBeNull()
  })
})
