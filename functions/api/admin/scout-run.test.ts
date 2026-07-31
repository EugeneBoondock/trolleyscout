import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildRegistryOnlineStores: vi.fn(),
  getMemberSession: vi.fn(),
  getStructuredRetailerSources: vi.fn(
    (): Array<{ countryCode?: string; key: string }> => [],
  ),
  readLeafletSnapshot: vi.fn(),
  refreshLeafletCache: vi.fn(),
  runStructuredRetailerFeedScout: vi.fn(),
  scoutNearbyStores: vi.fn(),
  runVoucherScout: vi.fn(async () => ({ expired: 0, sources: [] })),
  discoverVoucherSources: vi.fn(async () => []),
  listDiscoveredVoucherSources: vi.fn(async () => []),
}))

// The voucher lane reaches real retailer sites, so it is stubbed out unless a
// test is specifically about vouchers.
vi.mock('../../_shared/voucherScout', () => ({
  defaultVoucherSources: [
    { parser: 'public-code', retailerId: 'yuppiechef', sourceKey: 'yuppiechef::promotion-codes', url: 'https://www.yuppiechef.com/promotions.htm' },
  ],
  runVoucherScout: mocks.runVoucherScout,
}))

vi.mock('../../_shared/voucherSourceScout', () => ({
  discoverVoucherSources: mocks.discoverVoucherSources,
  listDiscoveredVoucherSources: mocks.listDiscoveredVoucherSources,
}))

vi.mock('../../_shared/memberStore', () => ({
  getMemberSession: mocks.getMemberSession,
}))

vi.mock('../../_shared/retailerFeedScout', () => ({
  getStructuredRetailerSources: mocks.getStructuredRetailerSources,
  runStructuredRetailerFeedScout: mocks.runStructuredRetailerFeedScout,
}))

vi.mock('../../_shared/storeScout', () => ({
  scoutNearbyStores: mocks.scoutNearbyStores,
}))

vi.mock('../../_shared/registryOnlineScout', () => ({
  buildRegistryOnlineStores: mocks.buildRegistryOnlineStores,
}))

vi.mock('../../_shared/dealSnapshotStore', () => ({
  readLeafletSnapshot: mocks.readLeafletSnapshot,
}))

vi.mock('../discovery', () => ({
  refreshLeafletCache: mocks.refreshLeafletCache,
}))

import { onRequest } from './scout-run'

const ENDPOINT = 'https://trolleyscout.co.za/api/admin/scout-run'

const feedResult = {
  acceptedDealCount: 240,
  catalogueCount: 3,
  catalogues: [],
  checkedSourceCount: 10,
  databaseAvailable: true,
  failedSourceCount: 0,
  physicalRequestCount: 4,
  sources: [{ acceptedDealCount: 240, catalogueCount: 3, key: 'takealot', status: 'success' }],
}

const registryStores = [
  { countryCode: 'ZA', name: 'Faithful To Nature', placeId: 'online:za:faithful-to-nature.co.za' },
  { countryCode: 'ZW', name: 'Gain Cash & Carry', placeId: 'online:zw:gaincash.co.zw' },
]

const currentCatalogues = [
  {
    capturedAt: '2026-07-27T10:00:00.000Z',
    countryCode: 'ZA',
    id: 'boxer-current',
    name: 'Boxer catalogue',
    retailerId: 'boxer',
    retailerName: 'Boxer',
    url: 'https://www.boxer.co.za/promotions/current',
  },
  {
    capturedAt: '2026-07-27T10:00:00.000Z',
    countryCode: 'ZA',
    id: 'shoprite-current',
    name: 'Shoprite catalogue',
    retailerId: 'shoprite',
    retailerName: 'Shoprite',
    url: 'https://www.shoprite.co.za/catalogues/current',
  },
]

describe('/api/admin/scout-run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberSession.mockResolvedValue({ isAuthenticated: false })
    mocks.readLeafletSnapshot.mockResolvedValue(undefined)
    mocks.refreshLeafletCache.mockResolvedValue(currentCatalogues)
    mocks.runStructuredRetailerFeedScout.mockResolvedValue(feedResult)
    mocks.scoutNearbyStores.mockResolvedValue(undefined)
    mocks.buildRegistryOnlineStores.mockReturnValue(registryStores)
    // clearAllMocks resets calls but keeps implementations, so a rejection set
    // by one test would otherwise fail every test after it.
    mocks.runVoucherScout.mockResolvedValue({ expired: 0, sources: [] })
    mocks.discoverVoucherSources.mockResolvedValue([])
    mocks.listDiscoveredVoucherSources.mockResolvedValue([])
    // The registry really does carry sources for more than one country now, and
    // the feed lane picks by country, so an empty list here would have every
    // press report that there is nothing to fetch.
    mocks.getStructuredRetailerSources.mockReturnValue([
      { key: 'woolworths::all-savings' },
      { key: 'takealot::promotion-campaigns-0' },
      { countryCode: 'US', key: 'flipp::walmart' },
      { countryCode: 'US', key: 'flipp::costco' },
    ])
  })

  it('keeps a signed-out visitor from starting a scout run', async () => {
    const response = await invoke(run())

    expect(response.status).toBe(403)
    expect(mocks.runStructuredRetailerFeedScout).not.toHaveBeenCalled()
    expect(mocks.scoutNearbyStores).not.toHaveBeenCalled()
  })

  it('does not let a member start a scout run', async () => {
    signedInAs('member-1', 'member')

    const response = await invoke(run({ lane: 'all' }))

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ data: { message: 'Admin access is required.' } })
    expect(mocks.runStructuredRetailerFeedScout).not.toHaveBeenCalled()
    expect(mocks.scoutNearbyStores).not.toHaveBeenCalled()
  })

  it('refuses a GET without even reading the session', async () => {
    const response = await invoke(new Request(ENDPOINT))

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
    expect(mocks.getMemberSession).not.toHaveBeenCalled()
    expect(mocks.runStructuredRetailerFeedScout).not.toHaveBeenCalled()
  })

  it('refuses a cross-site scout run', async () => {
    signedInAs('admin-1', 'admin')

    const response = await invoke(new Request(ENDPOINT, {
      body: JSON.stringify({ lane: 'all' }),
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      method: 'POST',
    }))

    expect(response.status).toBe(403)
    expect(mocks.runStructuredRetailerFeedScout).not.toHaveBeenCalled()
    expect(mocks.scoutNearbyStores).not.toHaveBeenCalled()
  })

  it('collects vouchers on a plain press, not only on the cron', async () => {
    signedInAs('admin-1', 'admin')
    mocks.runVoucherScout.mockResolvedValue({
      expired: 2,
      sources: [
        { discovered: 12, sourceKey: 'pick-n-pay::smart-shopper', written: 12 },
        { discovered: 0, sourceKey: 'yuppiechef::promotion-codes', written: 0 },
      ],
    })

    const response = await invoke(run({ lane: 'all' }))

    expect(response.status).toBe(200)
    expect(mocks.runVoucherScout).toHaveBeenCalledTimes(1)
    expect(await response.json()).toMatchObject({
      data: {
        vouchers: {
          emptySourceCount: 1,
          expiredCount: 2,
          failed: false,
          ran: true,
          voucherCount: 12,
        },
      },
    })
  })

  it('looks for voucher pages nobody has registered yet', async () => {
    signedInAs('admin-1', 'admin')
    mocks.discoverVoucherSources.mockResolvedValue([
      { candidateCount: 4, outcome: 'accepted', retailerId: 'clicks', url: 'https://clicks.co.za/vouchers' },
      { candidateCount: 0, outcome: 'empty', retailerId: 'game', url: 'https://www.game.co.za/vouchers' },
    ])

    const response = await invoke(run({ lane: 'vouchers' }))

    expect(response.status).toBe(200)
    expect(mocks.discoverVoucherSources).toHaveBeenCalledTimes(1)
    expect(await response.json()).toMatchObject({
      data: { vouchers: { discoveredSourceCount: 1, ran: true } },
    })
  })

  it('reports a failing voucher lane instead of throwing', async () => {
    signedInAs('admin-1', 'admin')
    mocks.runVoucherScout.mockRejectedValue(new Error('The voucher store is unavailable.'))

    const response = await invoke(run({ lane: 'vouchers' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        vouchers: { failed: true, message: 'The voucher store is unavailable.', ran: true },
      },
    })
  })

  it('refuses a lane it does not know', async () => {
    signedInAs('admin-1', 'admin')

    const response = await invoke(run({ lane: 'everything' }))

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      data: { issues: ['Provide a lane of all, catalogues, feeds, or stores.'] },
    })
    expect(mocks.runStructuredRetailerFeedScout).not.toHaveBeenCalled()
    expect(mocks.scoutNearbyStores).not.toHaveBeenCalled()
  })

  it('refreshes online catalogue sources without running the deal lanes', async () => {
    signedInAs('admin-1', 'admin', 'ZA')

    const response = await invoke(run({ lane: 'catalogues' }))

    expect(response.status).toBe(200)
    expect(mocks.runStructuredRetailerFeedScout).not.toHaveBeenCalled()
    expect(mocks.scoutNearbyStores).not.toHaveBeenCalled()
    expect(mocks.readLeafletSnapshot).toHaveBeenCalledTimes(1)
    expect(mocks.refreshLeafletCache).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      {
        targets: expect.arrayContaining([
          expect.objectContaining({ retailerId: 'boxer' }),
          expect.objectContaining({ sourceId: 'catalogue-specials-za' }),
        ]),
      },
    )
    expect(await response.json()).toMatchObject({
      data: {
        catalogues: {
          catalogueCount: 2,
          failed: false,
          ran: true,
          sourceCount: expect.any(Number),
        },
        feeds: { ran: false },
        lane: 'catalogues',
        message: '2 catalogues refreshed.',
        stores: { ran: false },
      },
    })
  })

  it('runs only the structured retailer feeds for the feeds lane, with a bounded request cap', async () => {
    signedInAs('admin-1', 'admin')

    const response = await invoke(run({ lane: 'feeds' }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.scoutNearbyStores).not.toHaveBeenCalled()
    expect(mocks.runStructuredRetailerFeedScout).toHaveBeenCalledTimes(1)

    const [, options] = mocks.runStructuredRetailerFeedScout.mock.calls[0]
    expect(options.requestCap).toBe(10)
    expect(options.timeoutMs).toBeLessThanOrEqual(12_000)

    expect(await response.json()).toMatchObject({
      data: {
        feeds: {
          acceptedDealCount: 240,
          checkedSourceCount: 10,
          failed: false,
          ran: true,
          requestCap: 10,
        },
        lane: 'feeds',
        message: '10 sources checked, 240 deals added.',
        stores: { ran: false },
      },
    })
  })

  it('sweeps the online storefront registry for the stores lane, with a bounded store limit', async () => {
    signedInAs('admin-1', 'admin')

    const response = await invoke(run({ lane: 'stores' }))

    expect(response.status).toBe(200)
    expect(mocks.runStructuredRetailerFeedScout).not.toHaveBeenCalled()
    expect(mocks.scoutNearbyStores).toHaveBeenCalledTimes(1)

    const [, stores, nowMs, limit] = mocks.scoutNearbyStores.mock.calls[0]
    expect(stores).toEqual(registryStores)
    expect(typeof nowMs).toBe('number')
    expect(limit).toBe(24)

    expect(await response.json()).toMatchObject({
      data: {
        feeds: { ran: false },
        lane: 'stores',
        // Two registry shops, one still held by a cooldown, so one is left.
        message: '2 stores swept, 1 still to sweep.',
        stores: {
          failed: false,
          ran: true,
          storeLimit: 24,
          storePromotionCount: 18,
          storesOffered: 2,
          storesScouted: 2,
        },
      },
    })
  })

  it('runs both lanes with smaller bounds when no lane is asked for', async () => {
    signedInAs('admin-1', 'admin')

    const response = await invoke(new Request(ENDPOINT, { method: 'POST' }))

    expect(response.status).toBe(200)
    expect(mocks.runStructuredRetailerFeedScout).toHaveBeenCalledTimes(1)
    expect(mocks.scoutNearbyStores).toHaveBeenCalledTimes(1)
    expect(mocks.runStructuredRetailerFeedScout.mock.calls[0][1].requestCap).toBe(6)
    expect(mocks.scoutNearbyStores.mock.calls[0][3]).toBe(10)
    expect(await response.json()).toMatchObject({
      data: {
        lane: 'all',
        message: '10 sources checked, 240 deals added, 2 stores swept, 1 still to sweep, 2 catalogues refreshed, 0 vouchers collected.',
      },
    })
  })

  it('reaches the sources that have gone longest unread, not just the first few', async () => {
    // A bounded run walks the list from the front and stops at the cap, so the
    // sources registered last â€” Takealot's campaign shards among them â€” were
    // never reached however many times the button was pressed.
    signedInAs('admin-1', 'admin')
    mocks.getStructuredRetailerSources.mockReturnValue([
      { key: 'woolworths::all-savings' },
      { key: 'clicks::promotion-products' },
      { key: 'takealot::promotion-campaigns-0' },
    ])

    const response = await invoke(
      new Request(`${ENDPOINT}?lane=feeds`, { method: 'POST' }),
      {
        prepare: () => ({
          all: async () => ({
            results: [
              { last_run: '2026-07-25T00:33:41.000Z', source_key: 'woolworths::all-savings' },
              { last_run: '2026-07-25T00:33:47.000Z', source_key: 'clicks::promotion-products' },
              // Longest unread, so it must be scouted first.
              { last_run: '2026-07-25T00:18:00.000Z', source_key: 'takealot::promotion-campaigns-0' },
            ],
          }),
        }),
      },
    )

    expect(response.status).toBe(200)
    const passed = mocks.runStructuredRetailerFeedScout.mock.calls[0][1].sources as Array<{
      key: string
    }>
    expect(passed[0].key).toBe('takealot::promotion-campaigns-0')
  })

  // An admin who has switched the console to another country is working there,
  // and a press that spent their whole budget on South African shops would
  // leave the country they are actually looking at empty.
  it('sweeps only the country the admin is working in', async () => {
    signedInAs('admin-1', 'admin', 'NL')

    const response = await invoke(run({ lane: 'stores' }))

    expect(response.status).toBe(200)
    expect(mocks.buildRegistryOnlineStores).toHaveBeenCalledWith(['NL'])
    expect(await response.json()).toMatchObject({ data: { country: 'NL' } })
  })

  // Not because the lane is South African â€” it is not, any more â€” but because
  // no feed has been built for the Netherlands yet, so the whole budget is
  // better spent on the shops that do serve it.
  it('skips the retailer feeds for a country that has none, and says why', async () => {
    signedInAs('admin-1', 'admin', 'NL')

    const response = await invoke(run())
    const body = await response.json() as { data: { message: string } }

    expect(mocks.runStructuredRetailerFeedScout).not.toHaveBeenCalled()
    expect(mocks.scoutNearbyStores).toHaveBeenCalledTimes(1)
    expect(body.data.message).toContain('No retailer feed covers Netherlands yet')
  })

  it('still runs the feeds for a South African admin', async () => {
    signedInAs('admin-1', 'admin', 'ZA')

    await invoke(run())

    expect(mocks.runStructuredRetailerFeedScout).toHaveBeenCalledTimes(1)
    expect(mocks.buildRegistryOnlineStores).toHaveBeenCalledWith(['ZA'])
  })

  // The point of the country switch once the feeds stopped being South
  // African: an admin working in the United States gets the American chains,
  // and none of their budget goes on Woolworths.
  it('sweeps the American chains for an admin working in the United States', async () => {
    signedInAs('admin-1', 'admin', 'US')

    const response = await invoke(run({ lane: 'feeds' }))

    expect(response.status).toBe(200)
    expect(mocks.runStructuredRetailerFeedScout).toHaveBeenCalledTimes(1)

    const [, options] = mocks.runStructuredRetailerFeedScout.mock.calls[0]
    expect(options.sources.map((source: { key: string }) => source.key)).toEqual([
      'flipp::walmart',
      'flipp::costco',
    ])
  })

  it('gives a South African press only the South African feeds', async () => {
    signedInAs('admin-1', 'admin', 'ZA')

    await invoke(run({ lane: 'feeds' }))

    const [, options] = mocks.runStructuredRetailerFeedScout.mock.calls[0]
    expect(options.sources.map((source: { key: string }) => source.key)).toEqual([
      'woolworths::all-savings',
      'takealot::promotion-campaigns-0',
    ])
  })

  it('sweeps every country when asked for all', async () => {
    signedInAs('admin-1', 'admin', 'NL')

    const response = await invoke(run({ country: 'all', lane: 'stores' }))

    expect(mocks.buildRegistryOnlineStores).toHaveBeenCalledWith(undefined)
    expect(await response.json()).toMatchObject({ data: { country: 'ALL' } })
  })

  // A typo must not quietly widen the sweep to the whole world.
  it('falls back to the admin country when the code is unreadable', async () => {
    signedInAs('admin-1', 'admin', 'NL')

    await invoke(run({ country: 'not-a-country', lane: 'stores' }))

    expect(mocks.buildRegistryOnlineStores).toHaveBeenCalledWith(['NL'])
  })

  it('accepts the lane from the query string too', async () => {
    signedInAs('admin-1', 'admin')

    const response = await invoke(new Request(`${ENDPOINT}?lane=feeds`, { method: 'POST' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ data: { lane: 'feeds' } })
    expect(mocks.scoutNearbyStores).not.toHaveBeenCalled()
  })

  it('reports a failing feed lane instead of throwing, and still sweeps stores', async () => {
    signedInAs('admin-1', 'admin')
    mocks.runStructuredRetailerFeedScout.mockRejectedValue(new Error('Takealot refused the request.'))

    const response = await invoke(run({ lane: 'all' }))

    expect(response.status).toBe(200)
    expect(mocks.scoutNearbyStores).toHaveBeenCalledTimes(1)
    expect(await response.json()).toMatchObject({
      data: {
        feeds: { failed: true, message: 'Takealot refused the request.', ran: true },
        message: '0 sources checked, 0 deals added, 2 stores swept, 1 still to sweep, 2 catalogues refreshed, 0 vouchers collected. The retailer feeds could not run.',
        stores: { failed: false, ran: true },
      },
    })
  })

  it('reports a failing store sweep instead of throwing', async () => {
    signedInAs('admin-1', 'admin')
    mocks.scoutNearbyStores.mockRejectedValue(new Error('The store log is unavailable.'))

    const response = await invoke(run({ lane: 'stores' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        message: '0 stores swept. The store sweep could not run.',
        stores: {
          failed: true,
          message: 'The store log is unavailable.',
          ran: true,
          storesOffered: 2,
          storesScouted: 0,
        },
      },
    })
  })

  it('names the sources that failed inside a lane that otherwise succeeded', async () => {
    signedInAs('admin-1', 'admin')
    mocks.runStructuredRetailerFeedScout.mockResolvedValue({
      ...feedResult,
      acceptedDealCount: 12,
      checkedSourceCount: 4,
      failedSourceCount: 1,
      sources: [
        { acceptedDealCount: 12, catalogueCount: 0, key: 'clicks', status: 'success' },
        { acceptedDealCount: 0, catalogueCount: 0, errorText: 'HTTP 503', key: 'makro', status: 'failed' },
      ],
    })

    const response = await invoke(run({ lane: 'feeds' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        feeds: {
          failed: false,
          failedSourceCount: 1,
          failures: [{ key: 'makro', message: 'HTTP 503' }],
        },
        message: '4 sources checked, 12 deals added. 1 source failed.',
      },
    })
  })

  it('says plainly that nothing ran when no scout database is connected', async () => {
    signedInAs('admin-1', 'admin')

    const response = await invoke(run({ lane: 'all' }), null)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        databaseAvailable: false,
        message: 'No scout database is connected, so nothing could be refreshed.',
      },
    })
  })

  it('refuses a body that is not valid JSON before any lane runs', async () => {
    signedInAs('admin-1', 'admin')

    const response = await invoke(new Request(ENDPOINT, {
      body: 'lane=feeds',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(400)
    expect(mocks.runStructuredRetailerFeedScout).not.toHaveBeenCalled()
    expect(mocks.scoutNearbyStores).not.toHaveBeenCalled()
  })
})

function signedInAs(id: string, role: 'admin' | 'member', countryCode = 'ZA') {
  mocks.getMemberSession.mockResolvedValue({
    account: { countryCode, id, role },
    isAuthenticated: true,
  })
}

function run(body: Record<string, unknown> = {}) {
  return new Request(ENDPOINT, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

// store_scout_log answers two different questions here: what this run swept,
// and how many shops are still held by a cooldown. The stub tells them apart by
// the cooldown column so each is asserted on its own figure.
function scoutLogDatabase(held = 1) {
  return {
    prepare: (sql: string) => ({
      bind: () => ({
        first: async () =>
          sql.includes('next_scout_at') ? { held } : { promotions: 18, stores: 2 },
      }),
    }),
  }
}

function invoke(request: Request, db: unknown = scoutLogDatabase()) {
  return onRequest({ env: { DB: db }, request } as never)
}

