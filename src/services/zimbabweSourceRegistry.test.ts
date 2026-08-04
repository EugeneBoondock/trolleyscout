import { describe, expect, it } from 'vitest'
import { getSadcRetailSources } from './sadcSourceRegistry'
import {
  getZimbabweAutomatedRetailSources,
  getZimbabweCatalogueSourcePages,
  getZimbabweDiscoverySources,
  getZimbabweSocialReferenceSources,
  ZIMBABWE_SOURCE_DIRECTORY,
} from './zimbabweSourceRegistry'

describe('Zimbabwe source directory', () => {
  it('keeps all 353 supplied records with stable unique ids', () => {
    expect(ZIMBABWE_SOURCE_DIRECTORY).toHaveLength(353)
    expect(new Set(ZIMBABWE_SOURCE_DIRECTORY.map((source) => source.id)).size)
      .toBe(353)
    expect(ZIMBABWE_SOURCE_DIRECTORY[0]?.id).toBe('001')
    expect(ZIMBABWE_SOURCE_DIRECTORY.at(-1)?.id).toBe('353')
  })

  it('separates direct sites from directories, social pages and old domains', () => {
    const direct = getZimbabweAutomatedRetailSources()
    const discovery = getZimbabweDiscoverySources()
    const social = getZimbabweSocialReferenceSources()

    expect(direct).toHaveLength(293)
    expect(discovery).toHaveLength(13)
    expect(social).toHaveLength(33)
    expect(
      direct.every((source) =>
        !/(?:facebook|instagram|linkedin|tiktok|whatsapp|youtube)\.com/i.test(
          source.url,
        ),
      ),
    ).toBe(true)
    expect(direct.map((source) => source.retailerName)).not.toContain(
      'Pelhams Zimbabwe',
    )
  })

  it('prefers the supplied specials and catalogue pages over generic home pages', () => {
    const byName = new Map(
      getZimbabweAutomatedRetailSources().map((source) => [
        source.retailerName,
        source,
      ]),
    )

    expect(byName.get('TM Pick n Pay Zimbabwe')?.url).toBe(
      'https://tmpnponline.co.zw/specials',
    )
    expect(byName.get('N. Richards Wholesalers')?.url).toBe(
      'https://nrichards.co.zw/promotions/',
    )
    expect(byName.get('BAMM Stationers')?.url).toBe(
      'https://www.bamm.co.zw/store/catalogue/',
    )
    expect(byName.get('Watumira Here')?.url).toBe(
      'https://www.watumirahere.co.za/',
    )
    expect(byName.get('Bulk & Barrel Zimbabwe')?.url).toBe(
      'https://bulkbmarketing-ux.github.io/bulk-barrel/',
    )
    expect(byName.get('First Class Groceries Zimbabwe')?.url).toBe(
      'https://www.firstclassgroceries.com/products',
    )
<<<<<<< HEAD
    expect(byName.get('Kambudzi Groceries')?.url).toBe(
      'https://kambudzi.com/search?q=special',
    )
    expect(byName.has('Food Emporium Zimbabwe')).toBe(false)
    expect(byName.has('FlexiMart Online Store')).toBe(false)
    expect(byName.has('MutareMart')).toBe(false)
    expect(byName.has('Online Musika')).toBe(false)
    expect(byName.has('SA to Zim')).toBe(false)
=======
>>>>>>> codex/developer-mcp-business-insights
  })

  it('exposes catalogue source pages for the catalogue scout', () => {
    const catalogues = getZimbabweCatalogueSourcePages()
    const names = catalogues.map((source) => source.retailerName)

    expect(names).toEqual(expect.arrayContaining([
      'TM Pick n Pay Zimbabwe',
      'BAMM Stationers',
      'College Press Zimbabwe',
      'Union Hardware',
    ]))
    expect(catalogues.every((source) => source.sourceId.startsWith('zw-directory-')))
      .toBe(true)
  })

  it('registers direct entries only for Zimbabwe', () => {
    const zwNames = getSadcRetailSources('ZW').map((source) => source.retailerName)
    const zaNames = getSadcRetailSources('ZA').map((source) => source.retailerName)

    expect(zwNames).toEqual(expect.arrayContaining([
      'BAMM Stationers',
      'TelOne Zimbabwe',
      'ZIMOCO',
    ]))
    expect(zaNames).not.toContain('BAMM Stationers')
    expect(zaNames).not.toContain('TelOne Zimbabwe')
    expect(zaNames).not.toContain('ZIMOCO')
  })
})
