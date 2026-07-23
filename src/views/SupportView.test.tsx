import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { SupportView } from './SupportView'

afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/')
})

describe('SupportView', () => {
  it('opens password-help requests on the account topic', () => {
    window.history.replaceState({}, '', '/support?topic=account')

    render(<SupportView />)

    expect((screen.getByLabelText('Topic') as HTMLSelectElement).value).toBe('Account & login')
  })
})
