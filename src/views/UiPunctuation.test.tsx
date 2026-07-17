import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AboutView } from './AboutView'
import { MoneyHelpView } from './MoneyHelpView'
import { ToolkitView } from './ToolkitView'

afterEach(cleanup)

describe('member information view punctuation', () => {
  it.each([
    ['About', <AboutView key="about" onOpen={vi.fn()} />],
    ['Money help', <MoneyHelpView key="money-help" onOpenSources={vi.fn()} />],
    ['Tools', <ToolkitView key="tools" />],
  ])('does not render an em dash in %s', (_name, view) => {
    const { container } = render(view)

    expect(container.textContent).not.toContain('\u2014')
  })
})
