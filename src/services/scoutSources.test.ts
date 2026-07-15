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
})
