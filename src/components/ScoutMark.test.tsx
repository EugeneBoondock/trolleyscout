import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ScoutMark } from './ScoutMark'

afterEach(cleanup)

describe('ScoutMark', () => {
  it('marks the navigation needle as scouting', () => {
    render(<ScoutMark motion="scout" />)

    expect(screen.getByTestId('scout-mark').className).toContain('is-scouting')
    expect(screen.getByTestId('scout-mark-needle')).toBeTruthy()
  })

  it('marks the loading needle as spinning', () => {
    render(<ScoutMark motion="spin" size={28} />)

    const mark = screen.getByTestId('scout-mark')
    expect(mark.className).toContain('is-spinning')
    expect(mark.getAttribute('style')).toContain('28px')
  })

  it('keeps the image decorative and exposes no duplicate label', () => {
    const { container } = render(<ScoutMark motion="static" />)

    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
    expect(screen.getByTestId('scout-mark').getAttribute('aria-hidden')).toBe('true')
  })
})
