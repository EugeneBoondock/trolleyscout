import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface PackageFile {
  scripts?: Record<string, string>
}

describe('production deployment safety', () => {
  it('applies remote D1 migrations before publishing Pages code', () => {
    const packageFile = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as PackageFile

    expect(packageFile.scripts?.['cf:migrate']).toBe(
      'wrangler d1 migrations apply trolley-scout --remote',
    )
    expect(packageFile.scripts?.['cf:deploy']).toBe(
      'npm run cf:migrate && npm run build && npm run cf:functions && wrangler pages deploy dist --project-name trolley-scout --branch master',
    )
  })
})
