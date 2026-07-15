import { describe, expect, it } from 'vitest'
import type { DealSnapshot } from '../_shared/dealSnapshotStore'
import { buildSnapshotChecks } from './discovery'

describe('buildSnapshotChecks', () => {
  it('surfaces catalogue scans from retailers outside the fixed source list', () => {
    const snapshots = new Map<string, DealSnapshot>([
      [
        'kit-kat::Catalogue scan',
        {
          checkedAt: '2026-07-15T12:00:00.000Z',
          deals: [
            {
              capturedAt: '2026-07-15T12:00:00.000Z',
              evidenceText: 'Tastic Rice 2kg R29.99',
              id: 'kit-kat-rice',
              priceText: 'R29.99',
              productUrl: 'https://kitkatgroup.com/current.pdf',
              retailerId: 'kit-kat',
              retailerName: 'Kit Kat Cash & Carry',
              sourceLabel: 'Catalogue scan',
              sourceUrl: 'https://kitkatgroup.com/current.pdf',
              title: 'Tastic Rice 2kg',
            },
          ],
        },
      ],
    ])

    const result = buildSnapshotChecks(snapshots)
    const external = result.find((item) => item.source.retailerId === 'kit-kat')

    expect(external?.source).toMatchObject({
      itemCount: 1,
      retailerName: 'Kit Kat Cash & Carry',
      sourceLabel: 'Catalogue scan',
      status: 'found',
    })
    expect(external?.deals[0].title).toBe('Tastic Rice 2kg')
  })
})
