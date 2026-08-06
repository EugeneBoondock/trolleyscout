/**
 * Serves product images at the size they are actually displayed.
 *
 * Retailer product photos are hotlinked straight into the app at whatever size
 * the shop published — often 1500px and several hundred kilobytes for a card
 * rendered 160px wide. For a shopper on prepaid data that is real money spent
 * on pixels nobody sees, which cuts against the whole point of the app.
 *
 * Cloudflare's transformation endpoint resizes at the edge and caches the
 * result. The free allowance is 5,000 UNIQUE transformations a month, so the
 * widths below are a short fixed ladder rather than whatever a layout happens
 * to ask for: every extra distinct width is another unique transformation, and
 * a hundred arbitrary widths would burn the allowance on one screen.
 */

/// Our own zone, which is where the transformation endpoint lives.
const TRANSFORM_ORIGIN = 'https://trolleyscout.co.za'

/**
 * The only widths we ask for.
 *
 * Requests are snapped to the nearest one so the number of unique
 * transformations stays proportional to the number of images, not to the
 * number of screen sizes our users happen to own.
 */
export const IMAGE_WIDTH_LADDER = [160, 320, 640, 960] as const

export interface ImageTransformOptions {
  width: number
  /// Leave images from our own storage alone unless asked; they are already
  /// sized correctly.
  transformOwnMedia?: boolean
}

/**
 * Returns a resized URL, or the original when transforming it would be wrong
 * or wasteful.
 */
export function transformedImageUrl(
  source: string | undefined,
  options: ImageTransformOptions,
): string | undefined {
  const url = (source ?? '').trim()
  if (!url) return undefined
  if (!/^https?:\/\//i.test(url)) return url
  // Already a transformation, or already ours: leave it alone.
  if (url.includes('/cdn-cgi/image/')) return url
  if (!options.transformOwnMedia && url.startsWith(TRANSFORM_ORIGIN)) return url
  // A data or SVG URL gains nothing and can be broken by resizing.
  if (/\.svg($|\?)/i.test(url)) return url

  const width = snapWidth(options.width)
  // format=auto serves WebP/AVIF where the device supports it, which is most
  // of the saving on a photo.
  const directives = `width=${width},quality=80,format=auto,fit=scale-down`
  return `${TRANSFORM_ORIGIN}/cdn-cgi/image/${directives}/${url}`
}

/** Rounds up to the next rung, so an image is never upscaled to fit a card. */
export function snapWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return IMAGE_WIDTH_LADDER[0]
  for (const rung of IMAGE_WIDTH_LADDER) {
    if (width <= rung) return rung
  }
  return IMAGE_WIDTH_LADDER[IMAGE_WIDTH_LADDER.length - 1]
}
