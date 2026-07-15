import { describe, expect, it, vi } from 'vitest'
import { runScheduledScout } from './scout'

describe('runScheduledScout', () => {
  it('forces a live site refresh before catalogue processing', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        data: {
          deals: [],
          leaflets: [],
          sources: [],
          summary: {
            checkedSourceCount: 0,
            dataPolicy: 'official sources',
            foundDealCount: 0,
            unavailableSourceCount: 0,
          },
        },
      }),
    )

    const result = await runScheduledScout(
      { SCOUT_ORIGIN: 'https://trolleyscout.co.za' },
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledWith(
      'https://trolleyscout.co.za/api/discovery?refresh=1',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    )
    expect(result).toMatchObject({
      catalogueDealCount: 0,
      refreshedDealCount: 0,
      refreshedSourceCount: 0,
    })
  })
})
