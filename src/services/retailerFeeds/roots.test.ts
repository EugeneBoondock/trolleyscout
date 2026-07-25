import { describe, expect, it } from 'vitest'
import { parseRootsLeaflets, parseRootsWindow } from './roots'

const context = {
  capturedAt: '2026-07-25T21:00:00.000Z',
  sourceUrl: 'https://rootsbutchery.co.za/specials/',
}

// Roots' own markup, as served: a dated heading, then the PDF beneath it.
function leaflet(heading: string, file: string) {
  return `
    <div class="elementor-widget-container">
      <h2 class="elementor-heading-title elementor-size-default">${heading}</h2>
    </div>
    <div class="elementor-widget-container">
      <p><a href="https://rootsbutchery.co.za/wp-content/uploads/2026/07/${file}">PDF &#8211; Download</a></p>
    </div>`
}

describe('parseRootsWindow', () => {
  it('reads the dates written the way a person says them', () => {
    expect(parseRootsWindow('National Month End Specials 24th July - 6th August 2026'))
      .toMatchObject({ validFrom: '2026-07-24', validTo: '2026-08-06' })
    expect(parseRootsWindow('Specials 1 May – 14 May 2026'))
      .toMatchObject({ validFrom: '2026-05-01', validTo: '2026-05-14' })
  })

  // Only the closing year is written. A leaflet running from December into
  // January belongs to the year before, not to the one it ends in.
  it('puts a leaflet that crosses New Year in the right years', () => {
    expect(parseRootsWindow('Festive Specials 20th December - 8th January 2027'))
      .toMatchObject({ validFrom: '2026-12-20', validTo: '2027-01-08' })
  })

  it('reads no window from a heading that names no dates', () => {
    expect(parseRootsWindow('Roots Butchery Specials')).toBeUndefined()
    expect(parseRootsWindow('Specials 30th Februs - 6th Augustus 2026')).toBeUndefined()
    expect(parseRootsWindow('Specials 31st June - 6th August 2026')).toBeUndefined()
  })
})

describe('parseRootsLeaflets', () => {
  it('publishes the running leaflet with its dates and document', () => {
    const page = parseRootsLeaflets(
      leaflet(
        'National Month End Specials 24th July - 6th August 2026',
        'Roots_Butchery_July_National_Month_End_compressed.pdf',
      ),
      context,
    )

    expect(page.catalogues).toHaveLength(1)
    expect(page.catalogues[0]).toMatchObject({
      catalogueId: 'Roots_Butchery_July_National_Month_End_compressed.pdf',
      format: 'pdf',
      scope: { type: 'national' },
      validFrom: '2026-07-24',
      validTo: '2026-08-06',
    })
  })

  // The page keeps last month's heading until the new one replaces it, and a
  // butchery special that has run out sends a shopper out for nothing.
  it('drops a leaflet that has already run out', () => {
    const page = parseRootsLeaflets(
      leaflet('Mid Month Specials 1st July - 10th July 2026', 'old.pdf') +
        leaflet('National Month End Specials 24th July - 6th August 2026', 'current.pdf'),
      context,
    )

    expect(page.catalogues.map((entry) => entry.catalogueId)).toEqual(['current.pdf'])
  })

  it('publishes nothing when the heading carries no dates', () => {
    const page = parseRootsLeaflets(leaflet('Roots Butchery Specials', 'undated.pdf'), context)

    expect(page.catalogues).toEqual([])
  })

  it('publishes nothing when the dated heading has no document under it', () => {
    const page = parseRootsLeaflets(
      '<h2>National Month End Specials 24th July - 6th August 2026</h2>',
      context,
    )

    expect(page.catalogues).toEqual([])
  })
})
