import { describe, expect, it } from 'vitest'
import { buildBoxerPromotionsUrl, parseBoxerDate, parseBoxerLeaflets } from './boxer'

const context = {
  capturedAt: '2026-07-25T21:00:00.000Z',
  sourceUrl: 'https://www.boxer.co.za/promotions/western-cape/all-divisions',
}

// Boxer's own card markup, as served.
function card(title: string, from: string, to: string, slug: string) {
  return `
    <div class="col col-md-4 pt10 pb10"><div align="left" class="inner innerstyle">
      <a class="cl-black" href="/?view=promotion_details&amp;article_id=8435"><img
        class="p15 promotions-thumbnail"
        src="https://www.boxer.co.za/storage/web/source/1/${slug}.jpg" alt=""></a>
      <div class="vcenter mlmoney pb15">
        <h4 class="mt17 mb5 cl-black">${title} </h4>
        <h6 class="cl-black"><p>Valid: ${from} - ${to}</p></h6>
        <a class="border-0 p5but theme-btn-s6" href="/post/promotion_details/${slug}">View Leaflet</a>
      </div>
    </div></div>`
}

describe('parseBoxerDate', () => {
  // South African leaflets are written day first, which is the opposite of how
  // a bare Date would read them: 07/08 is August, not July.
  it('reads a day-first date', () => {
    expect(parseBoxerDate('23/07/2026')).toBe('2026-07-23')
    expect(parseBoxerDate('7/8/2026')).toBe('2026-08-07')
  })

  it('refuses a date the calendar does not have', () => {
    expect(parseBoxerDate('31/02/2026')).toBeUndefined()
    expect(parseBoxerDate('23/13/2026')).toBeUndefined()
    expect(parseBoxerDate('2026-07-23')).toBeUndefined()
    expect(parseBoxerDate('')).toBeUndefined()
  })
})

describe('parseBoxerLeaflets', () => {
  it('publishes a running leaflet scoped to its province', () => {
    const page = parseBoxerLeaflets(
      card('WC July ME', '23/07/2026', '10/08/2026', 'WCME23.07.2026'),
      context,
      'western-cape',
    )

    expect(page.catalogues).toHaveLength(1)
    expect(page.catalogues[0]).toMatchObject({
      catalogueId: 'WCME23.07.2026',
      documentUrl: 'https://www.boxer.co.za/post/promotion_details/WCME23.07.2026',
      format: 'pdf',
      scope: { regionIds: ['western-cape'], type: 'province' },
      title: 'WC July ME',
      validFrom: '2026-07-23',
      validTo: '2026-08-10',
    })
  })

  // Boxer leaves last month's card up beside the current one. A shopper drives
  // out for a leaflet, so showing a lapsed one costs them a trip.
  it('drops a leaflet that has already run out', () => {
    const page = parseBoxerLeaflets(
      card('WC June ME', '20/06/2026', '06/07/2026', 'WCME20.06.2026') +
        card('WC July ME', '23/07/2026', '10/08/2026', 'WCME23.07.2026'),
      context,
      'western-cape',
    )

    expect(page.catalogues.map((entry) => entry.catalogueId)).toEqual(['WCME23.07.2026'])
  })

  it('drops a leaflet whose dates cannot be read at all', () => {
    const page = parseBoxerLeaflets(
      card('WC July ME', 'coming', 'soon', 'WCME23.07.2026'),
      context,
      'western-cape',
    )

    expect(page.catalogues).toEqual([])
  })

  it('keeps one entry per leaflet when a card is repeated', () => {
    const one = card('WC July ME', '23/07/2026', '10/08/2026', 'WCME23.07.2026')
    const page = parseBoxerLeaflets(one + one, context, 'western-cape')

    expect(page.catalogues).toHaveLength(1)
  })

  it('reads nothing from a page with no cards', () => {
    expect(parseBoxerLeaflets('<html><body>No promotions</body></html>', context, 'gauteng'))
      .toEqual({ candidates: [], catalogues: [] })
  })
})

describe('buildBoxerPromotionsUrl', () => {
  it('asks for one province across every division', () => {
    expect(buildBoxerPromotionsUrl('western-cape')).toBe(
      'https://www.boxer.co.za/promotions/western-cape/all-divisions',
    )
  })
})
