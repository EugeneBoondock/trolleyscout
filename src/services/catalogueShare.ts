import type { StoreLeaflet } from '../types'

export function catalogueShareUrl(
  leaflet: Pick<StoreLeaflet, 'id' | 'retailerId'>,
): string {
  const url = new URL('https://trolleyscout.co.za/deals')
  url.searchParams.set('catalogue', leaflet.id)
  url.searchParams.set('retailer', leaflet.retailerId)
  return url.toString()
}
