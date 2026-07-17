import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NearMeView } from './NearMeView'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('NearMeView motion', () => {
  it('uses the spinning scout mark while locating', () => {
    const getCurrentPosition = vi.fn()
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    })
    render(<NearMeView />)

    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))

    expect(getCurrentPosition).toHaveBeenCalledOnce()
    expect(screen.getAllByTestId('scout-mark')[0].className).toContain('is-spinning')
  })
})
