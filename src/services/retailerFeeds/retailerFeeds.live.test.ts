import { describe, expect, it } from 'vitest'
import {
  BRAND_SFCC_SHOPS,
  buildBrandSfccGridUrl,
  parseBrandSfccGrid,
} from './brandSfcc'
import {
  BASH_STOREFRONTS,
  buildBashSaleUrl,
  decodeBashNextData,
  parseBashFeed,
} from './bash'
import { buildCottonOnGridUrl, parseCottonOnGrid } from './cottonOn'
import {
  DEMANDWARE_SHOPS,
  buildDemandwareGridUrl,
  parseDemandwareGrid,
} from './demandware'
import {
  ORACLE_COMMERCE_SHOPS,
  buildOracleCommerceUrl,
  parseOracleCommerceFeed,
} from './oracleCommerce'
import {
  SHOPIFY_RETAILERS,
  buildShopifyRetailerUrl,
  parseShopifyRetailerFeed,
} from './shopifyRetailers'
import {
  buildSuperbalistHmUrl,
  decodeSuperbalistProductList,
  parseSuperbalistHmFeed,
} from './superbalistHm'
import {
  WOOTWARE_SPECIALS_URL,
  buildWootwareSearchRequest,
  parseWootwareSearchFeed,
} from './wootware'
import {
  SPORTSMANS_TOKEN_URL,
  buildSportsmansSearchRequest,
  parseSportsmansFeed,
  parseSportsmansSearchToken,
} from './sportsmansWarehouse'
import {
  buildZaraCategoriesUrl,
  buildZaraProductsUrl,
  parseZaraSaleCategories,
  parseZaraSaleFeed,
} from './zara'
import {
  ASICS_CATALOGUE_URL,
  buildAsicsCatalogueUrl,
  parseAsicsCatalogue,
} from './asics'
import { ROOTS_SPECIALS_URL, parseRootsLeaflets } from './roots'
import {
  buildBoxerPromotionsUrl,
  parseBoxerLeaflets,
} from './boxer'
import { parseFoodLoversFeed } from './foodLovers'
import {
  extractPdfLeaflets,
  leafletTargets,
} from '../leafletDiscovery'
import type { RetailerFeedPage } from './types'

const runLive = process.env.LIVE_RETAILER_FEEDS === '1'
const capturedAt = new Date().toISOString()
const htmlHeaders = {
  accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-ZA,en;q=0.9',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 TrolleyScout/1.0',
}

describe.skipIf(!runLive)('live South African retailer feeds', () => {
  it('reads Cape Union Mart and Old Khaki grids', async () => {
    for (const shop of DEMANDWARE_SHOPS) {
      const categoryId = shop.categoryIds[0]
      const sourceUrl = `https://${shop.host}/c/${categoryId}/`
      const response = await fetch(
        buildDemandwareGridUrl(shop, categoryId),
        { headers: htmlHeaders },
      )

      expect(response.status, shop.name).toBe(200)
      const page = parseDemandwareGrid(
        await response.text(),
        { capturedAt, sourceUrl },
        shop,
        categoryId,
      )
      expect(page.totalCount, shop.name).toBeGreaterThan(0)
      await expectCandidateImage(page)
    }
  }, 30_000)

  it('reads Edgars and Under Armour Shopify catalogues', async () => {
    for (const shop of SHOPIFY_RETAILERS) {
      const sourceUrl = `https://${shop.host}/`
      const response = await fetch(buildShopifyRetailerUrl(shop), {
        headers: { accept: 'application/json', 'accept-language': 'en-ZA,en;q=0.9' },
      })

      expect(response.status, shop.name).toBe(200)
      const page = parseShopifyRetailerFeed(
        await response.json(),
        { capturedAt, sourceUrl },
        shop,
      )
      expect(page.totalCount, shop.name).toBeGreaterThan(0)
      expect(page.candidates.length, shop.name).toBeGreaterThan(0)
      await expectCandidateImage(page)
    }
  }, 30_000)

  it('reads Cotton On sale tiles', async () => {
    const sourceUrl = 'https://cottonon.com/ZA/sale/'
    const response = await fetch(buildCottonOnGridUrl(), { headers: htmlHeaders })

    expect(response.status).toBe(200)
    const page = parseCottonOnGrid(await response.text(), { capturedAt, sourceUrl })
    expect(page.totalCount).toBeGreaterThan(0)
    expect(page.candidates.length).toBeGreaterThan(0)
    await expectCandidateImage(page)
  }, 30_000)

  it('reads Sportscene and Totalsports from Bash', async () => {
    for (const shop of BASH_STOREFRONTS) {
      const sourceUrl = new URL(shop.path, 'https://bash.com').toString()
      const response = await fetch(buildBashSaleUrl(shop), { headers: htmlHeaders })

      expect(response.status, shop.name).toBe(200)
      const page = parseBashFeed(
        decodeBashNextData(await response.text()),
        { capturedAt, sourceUrl },
        shop,
      )
      expect(page.totalCount, shop.name).toBeGreaterThan(0)
      expect(page.candidates.length, shop.name).toBeGreaterThan(0)
      await expectCandidateImage(page)
    }
  }, 30_000)

  it('reads Truworths and Office London sale products', async () => {
    for (const shop of ORACLE_COMMERCE_SHOPS) {
      const sourceUrl = `https://${shop.host}/`
      const response = await fetch(buildOracleCommerceUrl(shop), {
        headers: { accept: 'application/json', 'accept-language': 'en-ZA,en;q=0.9' },
      })

      expect(response.status, shop.name).toBe(200)
      const page = parseOracleCommerceFeed(
        await response.json(),
        { capturedAt, sourceUrl },
        shop,
        0,
      )
      expect(page.totalCount, shop.name).toBeGreaterThan(0)
      expect(page.candidates.length, shop.name).toBeGreaterThan(0)
      await expectCandidateImage(page)
    }
  }, 30_000)

  it('reads Adidas and New Balance public sale grids', async () => {
    for (const shop of BRAND_SFCC_SHOPS) {
      const sourceUrl = `https://${shop.host}${shop.sourcePath}`
      const response = await fetch(buildBrandSfccGridUrl(shop), { headers: htmlHeaders })

      expect(response.status, shop.name).toBe(200)
      const page = parseBrandSfccGrid(
        await response.text(),
        { capturedAt, sourceUrl },
        shop,
      )
      expect(page.totalCount, shop.name).toBeGreaterThan(0)
      expect(page.candidates.length, shop.name).toBeGreaterThan(0)
      await expectCandidateImage(page)
    }
  }, 30_000)

  it('reads ASICS South Africa’s national catalogue without inventing discounts', async () => {
    const response = await fetch(buildAsicsCatalogueUrl(), { headers: htmlHeaders })

    expect(response.status).toBe(200)
    const page = parseAsicsCatalogue(
      await response.text(),
      { capturedAt, sourceUrl: ASICS_CATALOGUE_URL },
    )
    expect(page.totalCount).toBeGreaterThan(0)
    expect(page.candidates.every((candidate) =>
      candidate.previousPriceCents !== undefined &&
      candidate.previousPriceCents > candidate.priceCents)).toBe(true)
  }, 30_000)

  it('reads H&M markdowns from its official South African partner', async () => {
    const sourceUrl = buildSuperbalistHmUrl()
    const response = await fetch(sourceUrl, { headers: htmlHeaders })

    expect(response.status).toBe(200)
    const page = parseSuperbalistHmFeed(
      decodeSuperbalistProductList(await response.text()),
      { capturedAt, sourceUrl },
    )
    expect(page.totalCount).toBeGreaterThan(0)
    expect(page.candidates.length).toBeGreaterThan(0)
    await expectCandidateImage(page)
  }, 30_000)

  it('serves the Mr Price image derived from its catalogue SKU', async () => {
    const url =
      'https://cdn.media.amplience.net/i/mrpricegroup/' +
      '01_107062347_SI_00?$preset$&fmt=auto'
    const response = await fetch(url, { headers: { range: 'bytes=0-1023' } })

    expect(response.ok).toBe(true)
    expect(response.headers.get('content-type')).toMatch(/^image\//)
  }, 15_000)

  it('reads Wootware open-box products, links, and images', async () => {
    const request = buildWootwareSearchRequest()
    const response = await fetch(request.url, request.init)

    expect(response.status).toBe(200)
    const page = parseWootwareSearchFeed(
      await response.json(),
      { capturedAt, sourceUrl: WOOTWARE_SPECIALS_URL },
    )
    expect(page.candidates.length).toBeGreaterThan(0)
    expect(page.candidates[0]?.productUrl).not.toBe(WOOTWARE_SPECIALS_URL)
    await expectCandidateImage(page)
  }, 30_000)

  it('reads the Sportsmans Warehouse Yellow Ticket index', async () => {
    const tokenResponse = await fetch(SPORTSMANS_TOKEN_URL, {
      headers: { ...htmlHeaders, accept: 'application/json' },
    })
    expect(tokenResponse.status).toBe(200)
    const token = parseSportsmansSearchToken(await tokenResponse.json())
    const request = buildSportsmansSearchRequest(token.token)
    const response = await fetch(request.url, request.init)

    expect(response.status).toBe(200)
    const page = parseSportsmansFeed(
      await response.json(),
      { capturedAt, sourceUrl: 'https://www.sportsmanswarehouse.co.za/category/outlet/' },
    )
    expect(page.totalCount).toBeGreaterThan(0)
    expect(page.candidates.length).toBeGreaterThan(0)
    await expectCandidateImage(page)
  }, 30_000)

  it('discovers and reads Zara South Africa sale products', async () => {
    const categoriesResponse = await fetch(buildZaraCategoriesUrl(), {
      headers: { ...htmlHeaders, accept: 'application/json' },
    })
    expect(categoriesResponse.status).toBe(200)
    const categoryIds = parseZaraSaleCategories(await categoriesResponse.json())
    expect(categoryIds.length).toBeGreaterThan(0)

    const response = await fetch(buildZaraProductsUrl(categoryIds[0]), {
      headers: { ...htmlHeaders, accept: 'application/json' },
    })
    expect(response.status).toBe(200)
    const page = parseZaraSaleFeed(
      await response.json(),
      { capturedAt, sourceUrl: 'https://www.zara.com/za/en/sale-l1314.html' },
    )
    expect(page.candidates.length).toBeGreaterThan(0)
    await expectCandidateImage(page)
  }, 30_000)

  it('reads the current Boxer and Roots Butchery leaflets', async () => {
    const boxerUrl = buildBoxerPromotionsUrl('gauteng')
    const [boxerResponse, rootsResponse] = await Promise.all([
      fetch(boxerUrl, { headers: htmlHeaders }),
      fetch(ROOTS_SPECIALS_URL, { headers: htmlHeaders }),
    ])

    expect(boxerResponse.status).toBe(200)
    expect(rootsResponse.status).toBe(200)
    const boxer = parseBoxerLeaflets(
      await boxerResponse.text(),
      { capturedAt, sourceUrl: boxerUrl },
      'gauteng',
    )
    const roots = parseRootsLeaflets(
      await rootsResponse.text(),
      { capturedAt, sourceUrl: ROOTS_SPECIALS_URL },
    )
    expect(boxer.catalogues.length).toBeGreaterThan(0)
    expect(roots.catalogues.length).toBeGreaterThan(0)
    await expectImageUrl(boxer.catalogues[0]?.imageUrl)
    await expectDocumentUrl(roots.catalogues[0]?.documentUrl)
  }, 30_000)

  it('reads current Food Lover’s, OK Foods, and Usave material', async () => {
    const foodRequest = fetch('https://foodloversmarket.co.za/wp-admin/admin-ajax.php', {
      body: new URLSearchParams({ action: 'get_specials' }).toString(),
      headers: {
        ...htmlHeaders,
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      method: 'POST',
    })
    const okFoods = leafletTargets.find((target) => target.retailerId === 'ok-foods')!
    const usave = leafletTargets.find((target) => target.retailerId === 'usave')!
    const [foodResponse, okResponse, usaveResponse] = await Promise.all([
      foodRequest,
      fetch(okFoods.pageUrl!, { headers: htmlHeaders }),
      fetch(usave.pageUrl!, { headers: htmlHeaders }),
    ])

    expect(foodResponse.status).toBe(200)
    expect(okResponse.status).toBe(200)
    expect(usaveResponse.status).toBe(200)
    const foodPage = parseFoodLoversFeed(
      await foodResponse.text(),
      { capturedAt, sourceUrl: 'https://foodloversmarket.co.za/specials/' },
    )
    const okLeaflets = extractPdfLeaflets(okFoods, await okResponse.text(), capturedAt)
    const usaveLeaflets = extractPdfLeaflets(usave, await usaveResponse.text(), capturedAt)

    expect(
      foodPage.candidates.length + foodPage.catalogues.length,
    ).toBeGreaterThan(0)
    expect(okLeaflets.length).toBeGreaterThanOrEqual(8)
    expect(usaveLeaflets.length).toBeGreaterThan(0)
    await expectImageUrl(okLeaflets[0]?.imageUrl)
    await expectImageUrl(usaveLeaflets[0]?.imageUrl)
    await expectDocumentUrl(okLeaflets[0]?.documentUrl)
    await expectDocumentUrl(usaveLeaflets[0]?.documentUrl)
  }, 30_000)
})

async function expectCandidateImage(page: RetailerFeedPage): Promise<void> {
  const imageUrl = page.candidates.find((candidate) => candidate.imageUrl)?.imageUrl

  if (!imageUrl) {
    return
  }

  const response = await fetch(imageUrl, {
    headers: {
      ...htmlHeaders,
      range: 'bytes=0-1023',
      referer: page.candidates[0]?.sourceUrl,
    },
  })
  expect(response.ok, imageUrl).toBe(true)
  expect(response.headers.get('content-type'), imageUrl).toMatch(/^image\//)
}

async function expectImageUrl(imageUrl: string | undefined): Promise<void> {
  expect(imageUrl).toBeTruthy()

  if (!imageUrl) {
    return
  }

  const response = await fetch(imageUrl, {
    headers: { ...htmlHeaders, range: 'bytes=0-1023' },
  })
  expect(response.ok, imageUrl).toBe(true)
  expect(response.headers.get('content-type'), imageUrl).toMatch(/^image\//)
}

async function expectDocumentUrl(documentUrl: string | undefined): Promise<void> {
  expect(documentUrl).toBeTruthy()

  if (!documentUrl) {
    return
  }

  const response = await fetch(documentUrl, {
    headers: { ...htmlHeaders, range: 'bytes=0-1023' },
  })
  expect(response.ok, documentUrl).toBe(true)
  expect(response.headers.get('content-type'), documentUrl).toMatch(/application\/pdf/)
}
