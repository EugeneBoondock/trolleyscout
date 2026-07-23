import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readDealSiteFeed: vi.fn(),
}))

vi.mock('./dealSiteScout', () => ({
  readDealSiteFeed: mocks.readDealSiteFeed,
}))

import { listWindowSaves } from './windowSocialStore'

describe('listWindowSaves', () => {
  beforeEach(() => vi.resetAllMocks())

  it('keeps MyRunway saves when only OneDayOnly has a usable feed', async () => {
    mocks.readDealSiteFeed.mockResolvedValue({
      deals: [{ id: 'onedayonly-live', source: 'onedayonly' }],
      sources: [{ id: 'onedayonly', label: 'OneDayOnly', count: 1, fetchedAt: '2026-07-19T12:00:00.000Z' }],
    })
    const deleted: string[] = []
    const rows = [
      saveRow('save-odo', 'onedayonly-gone', 'onedayonly'),
      saveRow('save-runway', 'myrunway-still-saved', 'myrunway'),
    ]
    const env = {
      DB: {
        prepare(sql: string) {
          const bindings: unknown[] = []
          return {
            bind(...values: unknown[]) {
              bindings.push(...values)
              return this
            },
            async all() {
              return { results: rows }
            },
            async run() {
              if (sql.startsWith('DELETE FROM window_saves')) {
                deleted.push(...bindings.map(String))
              }
              return { meta: { changes: bindings.length } }
            },
          }
        },
        // Stale saves are now deleted via a single batched DELETE (see
        // deleteRowsById) instead of one run() per row, so the fake D1 needs
        // a batch() that executes each already-bound statement in order.
        async batch(statements: Array<{ run: () => Promise<{ meta: { changes: number } }> }>) {
          return Promise.all(statements.map((statement) => statement.run()))
        },
      },
    }

    await expect(listWindowSaves(env as never, 'account-1')).resolves.toEqual([
      expect.objectContaining({ id: 'myrunway-still-saved' }),
    ])
    expect(deleted).toEqual(['save-odo'])
  })
})

function saveRow(id: string, dealId: string, source: string) {
  return {
    id,
    deal_id: dealId,
    source,
    deal_json: JSON.stringify({ id: dealId, source }),
    created_at: '2026-07-19T12:00:00.000Z',
  }
}
