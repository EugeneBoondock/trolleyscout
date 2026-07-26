import { describe, expect, it } from 'vitest'
import { isBusinessHost } from './host'

describe('business hostname selection', () => {
  it('selects the production and local business hosts', () => {
    expect(isBusinessHost('org.trolleyscout.co.za', '')).toBe(true)
    expect(isBusinessHost('org.localhost', '')).toBe(true)
    expect(isBusinessHost('localhost', '?business=1')).toBe(true)
  })

  it('keeps the consumer shell on shopper hosts', () => {
    expect(isBusinessHost('trolleyscout.co.za', '')).toBe(false)
    expect(isBusinessHost('www.trolleyscout.co.za', '')).toBe(false)
    expect(isBusinessHost('localhost', '')).toBe(false)
  })
})
