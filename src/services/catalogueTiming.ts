import type { StoreLeaflet } from '../types'

export type CatalogueTiming = 'current' | 'endingSoon' | 'upcoming'
export type CatalogueTimingFilter = 'all' | CatalogueTiming

export const catalogueTimingOptions: Array<{
  id: CatalogueTimingFilter
  label: string
}> = [
  { id: 'current', label: 'Current' },
  { id: 'endingSoon', label: 'Ending soon' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'all', label: 'All' },
]

export function catalogueTiming(
  catalogue: Pick<StoreLeaflet, 'validFrom' | 'validTo'>,
  now = new Date(),
): CatalogueTiming {
  const today = isoDay(now)
  if (isIsoDay(catalogue.validFrom) && catalogue.validFrom > today) {
    return 'upcoming'
  }

  if (isIsoDay(catalogue.validTo) && catalogue.validTo <= addUtcDays(today, 3)) {
    return 'endingSoon'
  }

  return 'current'
}

export function filterCataloguesByTiming<T extends Pick<StoreLeaflet, 'validFrom' | 'validTo'>>(
  catalogues: T[],
  filter: CatalogueTimingFilter,
  now = new Date(),
): T[] {
  if (filter === 'all') return catalogues
  return catalogues.filter((catalogue) => {
    const timing = catalogueTiming(catalogue, now)
    return filter === 'current'
      ? timing !== 'upcoming'
      : timing === filter
  })
}

export function catalogueTimingTitle(filter: CatalogueTimingFilter): string {
  switch (filter) {
    case 'endingSoon': return 'Catalogues ending soon'
    case 'upcoming': return 'Upcoming catalogues'
    case 'all': return 'All catalogue dates'
    default: return 'Current catalogues'
  }
}

function isIsoDay(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function isoDay(value: Date): string {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function addUtcDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return isoDay(date)
}
