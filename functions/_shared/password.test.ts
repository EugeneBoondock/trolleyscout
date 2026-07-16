import { describe, expect, it } from 'vitest'
import { hashPassword, validatePassword, verifyPassword } from './password'

describe('password', () => {
  it('hashes and verifies a correct password', async () => {
    const stored = await hashPassword('correct horse battery')

    expect(stored.startsWith('pbkdf2$')).toBe(true)
    expect(await verifyPassword('correct horse battery', stored)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse battery')

    expect(await verifyPassword('wrong horse battery', stored)).toBe(false)
  })

  it('never stores the password in plain text', async () => {
    const stored = await hashPassword('super-secret-value')

    expect(stored).not.toContain('super-secret-value')
  })

  it('produces a different hash per call (random salt)', async () => {
    const first = await hashPassword('same password')
    const second = await hashPassword('same password')

    expect(first).not.toBe(second)
    expect(await verifyPassword('same password', first)).toBe(true)
    expect(await verifyPassword('same password', second)).toBe(true)
  })

  it('rejects accounts with no password set, and malformed hashes', async () => {
    expect(await verifyPassword('anything', null)).toBe(false)
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('anything', 'pbkdf2$0$xx$yy')).toBe(false)
  })

  it('requires a minimum length', () => {
    expect(validatePassword('short')).toContain('at least 8')
    expect(validatePassword('longenough')).toBeUndefined()
  })
})
