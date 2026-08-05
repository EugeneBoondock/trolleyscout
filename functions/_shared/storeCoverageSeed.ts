import type { TrolleyScoutEnv } from './env'

export interface StoreCoveragePoint {
  countryCode: string
  label: string
  lat: number
  lon: number
}

export interface StoreCoverageSeedResult {
  candidateStoreCount: number
  failedPointCount: number
  pointCount: number
}

type StoreCoverageFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>

const THREE_HOURS_MS = 3 * 60 * 60 * 1000
const SOUTH_AFRICA_POINTS_PER_RUN = 3
const GLOBAL_POINTS_PER_RUN = 1

// A shopper-driven nearby index grows fastest in the busiest neighbourhoods
// and can leave smaller cities absent for months. The scheduled scout rotates
// through this national grid so physical-store coverage grows independently
// of where the first users happen to live. Each point still uses the same
// Geoapify-backed public endpoint, country filter, dedupe keys and source rules
// as an ordinary Near me search.
export const SOUTH_AFRICA_STORE_COVERAGE_POINTS: readonly StoreCoveragePoint[] = [
  { countryCode: 'ZA', label: 'Johannesburg', lat: -26.2041, lon: 28.0473 },
  { countryCode: 'ZA', label: 'Sandton', lat: -26.1076, lon: 28.0567 },
  { countryCode: 'ZA', label: 'Soweto', lat: -26.2485, lon: 27.8540 },
  { countryCode: 'ZA', label: 'Roodepoort', lat: -26.1625, lon: 27.8725 },
  { countryCode: 'ZA', label: 'Randburg', lat: -26.0936, lon: 28.0064 },
  { countryCode: 'ZA', label: 'Alberton', lat: -26.2679, lon: 28.1223 },
  { countryCode: 'ZA', label: 'Germiston', lat: -26.2259, lon: 28.1708 },
  { countryCode: 'ZA', label: 'Boksburg', lat: -26.2119, lon: 28.2596 },
  { countryCode: 'ZA', label: 'Kempton Park', lat: -26.1000, lon: 28.2293 },
  { countryCode: 'ZA', label: 'Midrand', lat: -25.9992, lon: 28.1263 },
  { countryCode: 'ZA', label: 'Pretoria', lat: -25.7479, lon: 28.2293 },
  { countryCode: 'ZA', label: 'Centurion', lat: -25.8603, lon: 28.1894 },
  { countryCode: 'ZA', label: 'Mamelodi', lat: -25.7069, lon: 28.3428 },
  { countryCode: 'ZA', label: 'Vereeniging', lat: -26.6731, lon: 27.9261 },
  { countryCode: 'ZA', label: 'Cape Town', lat: -33.9249, lon: 18.4241 },
  { countryCode: 'ZA', label: 'Bellville', lat: -33.8943, lon: 18.6294 },
  { countryCode: 'ZA', label: 'Mitchells Plain', lat: -34.0506, lon: 18.6182 },
  { countryCode: 'ZA', label: 'Khayelitsha', lat: -34.0380, lon: 18.6770 },
  { countryCode: 'ZA', label: 'Somerset West', lat: -34.0757, lon: 18.8433 },
  { countryCode: 'ZA', label: 'Paarl', lat: -33.7342, lon: 18.9621 },
  { countryCode: 'ZA', label: 'Stellenbosch', lat: -33.9321, lon: 18.8602 },
  { countryCode: 'ZA', label: 'Durban', lat: -29.8587, lon: 31.0218 },
  { countryCode: 'ZA', label: 'Umhlanga', lat: -29.7260, lon: 31.0859 },
  { countryCode: 'ZA', label: 'Pinetown', lat: -29.8167, lon: 30.8500 },
  { countryCode: 'ZA', label: 'Umlazi', lat: -29.9667, lon: 30.8833 },
  { countryCode: 'ZA', label: 'Pietermaritzburg', lat: -29.6006, lon: 30.3794 },
  { countryCode: 'ZA', label: 'Richards Bay', lat: -28.7807, lon: 32.0383 },
  { countryCode: 'ZA', label: 'Newcastle', lat: -27.7579, lon: 29.9318 },
  { countryCode: 'ZA', label: 'Gqeberha', lat: -33.9608, lon: 25.6022 },
  { countryCode: 'ZA', label: 'Kariega', lat: -33.7576, lon: 25.3971 },
  { countryCode: 'ZA', label: 'East London', lat: -33.0292, lon: 27.8546 },
  { countryCode: 'ZA', label: 'Mthatha', lat: -31.5889, lon: 28.7844 },
  { countryCode: 'ZA', label: 'Bloemfontein', lat: -29.0852, lon: 26.1596 },
  { countryCode: 'ZA', label: 'Welkom', lat: -27.9774, lon: 26.7351 },
  { countryCode: 'ZA', label: 'Polokwane', lat: -23.9045, lon: 29.4689 },
  { countryCode: 'ZA', label: 'Thohoyandou', lat: -22.9456, lon: 30.4840 },
  { countryCode: 'ZA', label: 'Tzaneen', lat: -23.8322, lon: 30.1635 },
  { countryCode: 'ZA', label: 'Mbombela', lat: -25.4658, lon: 30.9853 },
  { countryCode: 'ZA', label: 'Emalahleni', lat: -25.8713, lon: 29.2332 },
  { countryCode: 'ZA', label: 'Secunda', lat: -26.5155, lon: 29.1947 },
  { countryCode: 'ZA', label: 'Rustenburg', lat: -25.6676, lon: 27.2421 },
  { countryCode: 'ZA', label: 'Klerksdorp', lat: -26.8521, lon: 26.6667 },
  { countryCode: 'ZA', label: 'Potchefstroom', lat: -26.7145, lon: 27.0970 },
  { countryCode: 'ZA', label: 'Mahikeng', lat: -25.8652, lon: 25.6442 },
  { countryCode: 'ZA', label: 'Kimberley', lat: -28.7282, lon: 24.7499 },
  { countryCode: 'ZA', label: 'Upington', lat: -28.4478, lon: 21.2561 },
  { countryCode: 'ZA', label: 'George', lat: -33.9881, lon: 22.4530 },
  { countryCode: 'ZA', label: 'Mossel Bay', lat: -34.1831, lon: 22.1461 },
  { countryCode: 'ZA', label: 'Knysna', lat: -34.0351, lon: 23.0465 },
  { countryCode: 'ZA', label: 'Worcester', lat: -33.6465, lon: 19.4485 },
  { countryCode: 'ZA', label: 'Hermanus', lat: -34.4187, lon: 19.2345 },
  { countryCode: 'ZA', label: 'Ladysmith', lat: -28.5597, lon: 29.7808 },
  { countryCode: 'ZA', label: 'Nelspruit East', lat: -25.4740, lon: 31.0200 },
  { countryCode: 'ZA', label: 'Lephalale', lat: -23.6667, lon: 27.7500 },
  { countryCode: 'ZA', label: 'Mokopane', lat: -24.1944, lon: 29.0097 },
  { countryCode: 'ZA', label: 'Queenstown', lat: -31.8976, lon: 26.8753 },
  { countryCode: 'ZA', label: 'Vryheid', lat: -27.7695, lon: 30.7917 },
]

export const GLOBAL_STORE_COVERAGE_POINTS: readonly StoreCoveragePoint[] = [
  { countryCode: 'AO', label: 'Luanda', lat: -8.8390, lon: 13.2894 },
  { countryCode: 'BW', label: 'Gaborone', lat: -24.6282, lon: 25.9231 },
  { countryCode: 'BW', label: 'Francistown', lat: -21.1661, lon: 27.5144 },
  { countryCode: 'CD', label: 'Kinshasa', lat: -4.4419, lon: 15.2663 },
  { countryCode: 'KE', label: 'Nairobi', lat: -1.2921, lon: 36.8219 },
  { countryCode: 'KM', label: 'Moroni', lat: -11.7172, lon: 43.2473 },
  { countryCode: 'LS', label: 'Maseru', lat: -29.3158, lon: 27.4869 },
  { countryCode: 'MG', label: 'Antananarivo', lat: -18.8792, lon: 47.5079 },
  { countryCode: 'MU', label: 'Port Louis', lat: -20.1609, lon: 57.5012 },
  { countryCode: 'MW', label: 'Lilongwe', lat: -13.9626, lon: 33.7741 },
  { countryCode: 'MW', label: 'Blantyre', lat: -15.7861, lon: 35.0058 },
  { countryCode: 'MZ', label: 'Maputo', lat: -25.9692, lon: 32.5732 },
  { countryCode: 'NA', label: 'Windhoek', lat: -22.5609, lon: 17.0658 },
  { countryCode: 'SC', label: 'Victoria', lat: -4.6191, lon: 55.4513 },
  { countryCode: 'SZ', label: 'Mbabane', lat: -26.3054, lon: 31.1367 },
  { countryCode: 'TZ', label: 'Dar es Salaam', lat: -6.7924, lon: 39.2083 },
  { countryCode: 'ZM', label: 'Lusaka', lat: -15.3875, lon: 28.3228 },
  { countryCode: 'ZM', label: 'Kitwe', lat: -12.8024, lon: 28.2132 },
  { countryCode: 'ZW', label: 'Harare', lat: -17.8252, lon: 31.0335 },
  { countryCode: 'ZW', label: 'Bulawayo', lat: -20.1325, lon: 28.6265 },
  { countryCode: 'AR', label: 'Buenos Aires', lat: -34.6037, lon: -58.3816 },
  { countryCode: 'AT', label: 'Vienna', lat: 48.2082, lon: 16.3738 },
  { countryCode: 'CA', label: 'Toronto', lat: 43.6532, lon: -79.3832 },
  { countryCode: 'GB', label: 'London', lat: 51.5072, lon: -0.1276 },
  { countryCode: 'NL', label: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
  { countryCode: 'NZ', label: 'Auckland', lat: -36.8509, lon: 174.7645 },
  { countryCode: 'SA', label: 'Riyadh', lat: 24.7136, lon: 46.6753 },
  { countryCode: 'AE', label: 'Dubai', lat: 25.2048, lon: 55.2708 },
  { countryCode: 'US', label: 'New York', lat: 40.7128, lon: -74.0060 },
  { countryCode: 'US', label: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
]

export function buildStoreCoverageSeedBatch(
  nowMs: number,
): StoreCoveragePoint[] {
  if (!Number.isFinite(nowMs)) {
    throw new TypeError('nowMs must be a finite timestamp.')
  }
  const bucket = Math.floor(nowMs / THREE_HOURS_MS)
  return [
    ...rotatingWindow(
      SOUTH_AFRICA_STORE_COVERAGE_POINTS,
      SOUTH_AFRICA_POINTS_PER_RUN,
      bucket * SOUTH_AFRICA_POINTS_PER_RUN,
    ),
    ...rotatingWindow(
      GLOBAL_STORE_COVERAGE_POINTS,
      GLOBAL_POINTS_PER_RUN,
      bucket * GLOBAL_POINTS_PER_RUN,
    ),
  ]
}

export async function seedStoreCoverage(
  env: TrolleyScoutEnv & { SCOUT_ORIGIN?: string },
  fetcher: StoreCoverageFetch,
  nowMs: number,
): Promise<StoreCoverageSeedResult> {
  const origin = trustedScoutOrigin(env.SCOUT_ORIGIN)
  if (!origin) {
    return { candidateStoreCount: 0, failedPointCount: 0, pointCount: 0 }
  }
  const points = buildStoreCoverageSeedBatch(nowMs)
  const results = await Promise.allSettled(points.map(async (point) => {
    const url = new URL('/api/nearby-stores', origin)
    url.searchParams.set('country', point.countryCode)
    url.searchParams.set('lat', String(point.lat))
    url.searchParams.set('lon', String(point.lon))
    url.searchParams.set('radius', '15000')
    const response = await fetcher(url.toString(), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      throw new Error(`Store coverage seed returned ${response.status}.`)
    }
    const payload = await response.json() as { stores?: unknown }
    return Array.isArray(payload.stores) ? payload.stores.length : 0
  }))

  return {
    candidateStoreCount: results.reduce(
      (total, result) => total + (result.status === 'fulfilled' ? result.value : 0),
      0,
    ),
    failedPointCount: results.filter((result) => result.status === 'rejected').length,
    pointCount: points.length,
  }
}

function rotatingWindow<T>(
  items: readonly T[],
  limit: number,
  start: number,
): T[] {
  if (items.length === 0 || limit <= 0) return []
  const count = Math.min(items.length, Math.floor(limit))
  const offset = ((Math.floor(start) % items.length) + items.length) % items.length
  return Array.from({ length: count }, (_, index) =>
    items[(offset + index) % items.length] as T)
}

function trustedScoutOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return undefined
    return url.origin
  } catch {
    return undefined
  }
}
