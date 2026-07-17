import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { LoadingStrip } from './App'

afterEach(cleanup)

it('uses the spinning scout mark for content loading', () => {
  render(<LoadingStrip label="Checking official deal pages" />)

  expect(screen.getByRole('status').textContent).toContain('Checking official deal pages')
  expect(screen.getByTestId('scout-mark').className).toContain('is-spinning')
})
