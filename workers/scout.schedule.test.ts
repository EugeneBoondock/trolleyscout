/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('runs hourly so resumable catalogue scans keep progressing', () => {
  const config = readFileSync(resolve(process.cwd(), 'wrangler.scout.toml'), 'utf8')

  expect(config).toContain('crons = ["17 * * * *"]')
})
