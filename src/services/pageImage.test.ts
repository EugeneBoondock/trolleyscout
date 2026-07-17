import { describe, expect, it } from 'vitest'
import { extractPageImage } from './pageImage'

describe('extractPageImage', () => {
  it('reads og:image with property before content', () => {
    const html = '<meta property="og:image" content="https://cdn.example.co.za/p/123.jpg">'

    expect(extractPageImage(html, 'https://example.co.za/product')).toBe(
      'https://cdn.example.co.za/p/123.jpg',
    )
  })

  it('reads og:image with content before property', () => {
    const html = '<meta content="https://cdn.example.co.za/p/9.jpg" property="og:image" />'

    expect(extractPageImage(html, 'https://example.co.za/x')).toBe('https://cdn.example.co.za/p/9.jpg')
  })

  it('prefers the secure og:image and resolves relative URLs', () => {
    const html = [
      '<meta property="og:image:secure_url" content="/images/product.png">',
      '<meta name="twitter:image" content="https://other.example/img.png">',
    ].join('\n')

    expect(extractPageImage(html, 'https://shop.example.co.za/deals/1')).toBe(
      'https://shop.example.co.za/images/product.png',
    )
  })

  it('falls back to twitter:image', () => {
    const html = '<meta name="twitter:image" content="https://cdn.example/t.jpg">'

    expect(extractPageImage(html, 'https://example.co.za')).toBe('https://cdn.example/t.jpg')
  })

  it('rejects non-https results and missing tags', () => {
    expect(
      extractPageImage('<meta property="og:image" content="http://cdn.example/x.jpg">', 'https://e.co.za'),
    ).toBeUndefined()
    expect(extractPageImage('<p>no meta here</p>', 'https://e.co.za')).toBeUndefined()
  })

  it('decodes HTML entities in the URL', () => {
    const html = '<meta property="og:image" content="https://cdn.example/p.jpg?a=1&amp;b=2">'

    expect(extractPageImage(html, 'https://e.co.za')).toBe('https://cdn.example/p.jpg?a=1&b=2')
  })
})
