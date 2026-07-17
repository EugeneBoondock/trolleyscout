import { describe, expect, it } from 'vitest'
import { extractRetailerLeafletsFromHtml, externalRetailerTargets } from './scoutSources'

describe('external retailer scouting', () => {
  it('extracts official catalogue documents and cover images', () => {
    const target = externalRetailerTargets.find((candidate) => candidate.retailerId === 'kit-kat')!
    const html = `
      <section class="promotion">
        <h3>Citizen Weekly Special</h3>
        <img src="/images/citizen-weekly.jpg" alt="Citizen weekly deals">
        <a href="/pdfs/Citizen%20Weekly%20Special%20July%202026.pdf">Download</a>
      </section>
      <a href="/pdfs/privacy-policy.pdf">Privacy policy</a>
    `

    const leaflets = extractRetailerLeafletsFromHtml(target, html, '2026-07-15T12:00:00.000Z')

    expect(leaflets).toHaveLength(1)
    expect(leaflets[0]).toMatchObject({
      documentUrl: 'https://kitkatgroup.com/pdfs/Citizen%20Weekly%20Special%20July%202026.pdf',
      imageUrl: 'https://kitkatgroup.com/images/citizen-weekly.jpg',
      name: 'Citizen Weekly Special',
      retailerId: 'kit-kat',
      retailerName: 'Kit Kat Cash & Carry',
    })
  })

  it('trusts branch-catalogue PDFs with no keyword for trustAllPdfs targets', () => {
    const frontline = externalRetailerTargets.find((candidate) => candidate.retailerId === 'frontline')!

    expect(frontline.trustAllPdfs).toBe(true)

    // Frontline lists store-branch catalogues named by branch, no "specials".
    const html = `
      <div itemprop="name">Cosmo</div>
      <a href="https://files.sitebuilder.1-grid.com/b1/61/b1619084.pdf" class="image-link">View</a>
      <a href="https://frontlinesa.co.za/privacy-policy.pdf">Privacy</a>
    `

    const leaflets = extractRetailerLeafletsFromHtml(frontline, html, '2026-07-16T00:00:00.000Z')

    expect(leaflets).toHaveLength(1)
    expect(leaflets[0].documentUrl).toBe('https://files.sitebuilder.1-grid.com/b1/61/b1619084.pdf')
    expect(leaflets[0].retailerName).toBe('Frontline Hyper')
    // "View" is link chrome and the filename is a UUID — never surface either.
    expect(leaflets[0].name).toBe('Frontline Hyper promotions leaflet')
  })

  it('names sitebuilder leaflets from the anchor text (live Frontline shape)', () => {
    const frontline = externalRetailerTargets.find((candidate) => candidate.retailerId === 'frontline')!

    // The live frontlinesa.co.za nav links its promo PDF as plain anchor text.
    const html = `
      <li><a href="https://frontlinesa.co.za/">Home</a></li>
      <li><a data-testid="link" href="https://files.sitebuilder.1-grid.com/b1/61/b1619084-32bd-4514-a9d1-698681d25cb2.pdf">Promotions</a></li>
    `

    const leaflets = extractRetailerLeafletsFromHtml(frontline, html, '2026-07-17T00:00:00.000Z')

    expect(leaflets).toHaveLength(1)
    expect(leaflets[0].name).toBe('Promotions')
  })
})
