import { countryFromCode, detectRequestCountry } from '../_shared/countryContext'
import type { TrolleyScoutEnv } from '../_shared/env'
import { json, methodNotAllowed } from '../_shared/respond'

const HOLIDAY_API = 'https://date.nager.at/api/v3/publicholidays'
const REQUEST_TIMEOUT_MS = 5_000

interface NagerHoliday {
  date?: unknown
  global?: unknown
  localName?: unknown
  name?: unknown
  types?: unknown
}

interface RetailHoliday {
  date: string
  localName?: string
  name: string
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ request }) => {
  if (request.method !== 'GET') return methodNotAllowed(request.method)

  const url = new URL(request.url)
  const requestedCountry = url.searchParams.get('country') ?? undefined
  const detectedCountry = detectRequestCountry(request)
  const country = countryFromCode(requestedCountry ?? detectedCountry.code)
  const year = new Date().getUTCFullYear()
  const holidayLists = await Promise.all([
    readPublicHolidays(country.code, year),
    readPublicHolidays(country.code, year + 1),
  ])
  const holidays = holidayLists
    .flat()
    .filter((holiday, index, list) => (
      list.findIndex((candidate) => (
        candidate.date === holiday.date && candidate.name === holiday.name
      )) === index
    ))
    .sort((left, right) => left.date.localeCompare(right.date))

  return json(
    {
      country,
      holidays,
      source: {
        label: 'Nager.Date public holiday calendar',
        url: 'https://date.nager.at/api',
      },
    },
    {
      headers: {
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=21600, s-maxage=86400',
      },
    },
  )
}

async function readPublicHolidays(countryCode: string, year: number): Promise<RetailHoliday[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${HOLIDAY_API}/${year}/${encodeURIComponent(countryCode)}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return []
    const payload = await response.json() as unknown
    if (!Array.isArray(payload)) return []
    return payload.flatMap(mapHoliday)
  } catch {
    return []
  } finally {
    clearTimeout(timeout)
  }
}

function mapHoliday(value: unknown): RetailHoliday[] {
  if (!value || typeof value !== 'object') return []
  const holiday = value as NagerHoliday
  if (
    typeof holiday.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(holiday.date) ||
    typeof holiday.name !== 'string' ||
    !holiday.name.trim()
  ) {
    return []
  }
  if (holiday.global === false) return []
  if (Array.isArray(holiday.types) && !holiday.types.some((type) => type === 'Public')) {
    return []
  }
  return [{
    date: holiday.date,
    localName: typeof holiday.localName === 'string' && holiday.localName.trim()
      ? holiday.localName.trim()
      : undefined,
    name: holiday.name.trim(),
  }]
}
