import { describe, expect, it } from 'vitest'

import {
  IMAGE_WIDTH_LADDER,
  snapWidth,
  transformedImageUrl,
} from './imageTransform'

const photo = 'https://cdn.retailer.test/products/jeans-1500.jpg'

describe('image transforms', () => {
  it('serves a card-sized image instead of the shop\'s full-size photo', () => {
    const url = transformedImageUrl(photo, { width: 150 })

    expect(url).toContain('/cdn-cgi/image/')
    expect(url).toContain('width=160')
    // format=auto is most of the saving on a photo.
    expect(url).toContain('format=auto')
    expect(url).toContain(photo)
  })

  it('snaps to a short ladder, because unique widths cost the allowance', () => {
    // 5,000 unique transformations a month are free. A hundred arbitrary
    // widths would spend that on a single screen, so every request rounds on
    // to one of four rungs.
    expect(snapWidth(1)).toBe(160)
    expect(snapWidth(160)).toBe(160)
    expect(snapWidth(161)).toBe(320)
    expect(snapWidth(5_000)).toBe(IMAGE_WIDTH_LADDER.at(-1))
    expect(new Set(IMAGE_WIDTH_LADDER).size).toBe(IMAGE_WIDTH_LADDER.length)
  })

  it('never upscales a small image to fill a big card', () => {
    // fit=scale-down means a 100px source stays 100px rather than being
    // stretched and re-encoded for nothing.
    expect(transformedImageUrl(photo, { width: 640 })).toContain(
      'fit=scale-down',
    )
  })

  it('leaves alone what it cannot improve', () => {
    // Already transformed.
    const transformed =
      'https://trolleyscout.co.za/cdn-cgi/image/width=320/https://x.test/a.jpg'
    expect(transformedImageUrl(transformed, { width: 160 })).toBe(transformed)

    // Vector art, which resizing can only break.
    const svg = 'https://cdn.retailer.test/logo.svg'
    expect(transformedImageUrl(svg, { width: 160 })).toBe(svg)

    // Our own media, already stored at the right size.
    const own = 'https://trolleyscout.co.za/media/catalogue/page-1.jpg'
    expect(transformedImageUrl(own, { width: 160 })).toBe(own)
  })

  it('passes through anything that is not an absolute web image', () => {
    expect(transformedImageUrl(undefined, { width: 160 })).toBeUndefined()
    expect(transformedImageUrl('   ', { width: 160 })).toBeUndefined()
    expect(transformedImageUrl('/local/asset.png', { width: 160 })).toBe(
      '/local/asset.png',
    )
  })
})
