import { describe, expect, it } from 'vitest'

import { routeInstruction } from '../services/storeNavigation'

describe('routeInstruction', () => {
  it('formats route steps for Trolley Scout navigation', () => {
    expect(routeInstruction({ modifier: 'right', name: 'Main Road', type: 'turn' })).toBe(
      'Turn right onto Main Road',
    )
    expect(routeInstruction({ modifier: 'right', name: '', type: 'arrive' })).toBe(
      'Your destination is on the right',
    )
  })
})
