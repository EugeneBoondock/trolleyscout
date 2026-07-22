import { countries, getEmojiFlag, type TCountryCode } from 'countries-list'
import type { CountryContext, CountryOption } from '../../src/types'
import type { TrolleyScoutEnv } from './env'

const DEFAULT_COUNTRY_CODE = 'ZA'
const RATE_TTL_MS = 24 * 60 * 60 * 1000
const RATE_TIMEOUT_MS = 5_000
const RATE_ORIGIN = 'https://api.frankfurter.dev/v2/rate'

interface ExchangeRateRow {
  fetched_at: string
  rate_date: string | null
  rate_from_zar: number
}

export function detectRequestCountry(request: Request): CountryOption {
  const workerCountry = (request as Request & { cf?: { country?: string | null } }).cf?.country
  const headerCountry = request.headers.get('cf-ipcountry')
  return countryFromCode(workerCountry ?? headerCountry ?? DEFAULT_COUNTRY_CODE)
}

export function countryFromCode(input: string | undefined): CountryOption {
  const code = input?.trim().toUpperCase() ?? DEFAULT_COUNTRY_CODE
  const record = countries[code as TCountryCode] ?? countries.ZA
  const resolvedCode = (countries[code as TCountryCode] ? code : DEFAULT_COUNTRY_CODE) as TCountryCode
  const currencyCode = record.currency[0] ?? 'USD'

  return {
    capital: record.capital || undefined,
    code: resolvedCode,
    currencyCode,
    flag: getEmojiFlag(resolvedCode),
    name: record.name,
  }
}

export function listCountryOptions(): CountryOption[] {
  return (Object.keys(countries) as TCountryCode[])
    .map(countryFromCode)
    .sort((left, right) => left.name.localeCompare(right.name))
}

export async function getCountryContext(
  env: TrolleyScoutEnv,
  countryCode: string,
): Promise<CountryContext> {
  const country = countryFromCode(countryCode)
  const rate = await getRateFromZar(env, country.currencyCode)

  return {
    ...country,
    locale: `en-${country.code}`,
    rateFromZar: rate?.rate,
    rateUpdatedAt: rate?.updatedAt,
  }
}

async function getRateFromZar(
  env: TrolleyScoutEnv,
  currencyCode: string,
): Promise<{ rate: number; updatedAt: string } | undefined> {
  if (currencyCode === 'ZAR') {
    return { rate: 1, updatedAt: new Date().toISOString() }
  }

  const cached = await readRate(env, currencyCode)
  if (cached && Date.now() - Date.parse(cached.fetched_at) < RATE_TTL_MS) {
    return { rate: cached.rate_from_zar, updatedAt: cached.rate_date ?? cached.fetched_at }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RATE_TIMEOUT_MS)

  try {
    const response = await fetch(`${RATE_ORIGIN}/ZAR/${encodeURIComponent(currencyCode)}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return cachedRate(cached)
    const payload = (await response.json()) as { date?: unknown; rate?: unknown }
    const rate = Number(payload.rate)
    if (!Number.isFinite(rate) || rate <= 0) return cachedRate(cached)

    const fetchedAt = new Date().toISOString()
    const rateDate = typeof payload.date === 'string' ? payload.date : undefined
    await writeRate(env, currencyCode, rate, rateDate, fetchedAt)
    return { rate, updatedAt: rateDate ?? fetchedAt }
  } catch {
    return cachedRate(cached)
  } finally {
    clearTimeout(timer)
  }
}

async function readRate(env: TrolleyScoutEnv, currencyCode: string): Promise<ExchangeRateRow | undefined> {
  if (!env.DB) return undefined
  try {
    return (await env.DB.prepare(
      `SELECT rate_from_zar, rate_date, fetched_at
        FROM country_exchange_rates WHERE currency_code = ?`,
    ).bind(currencyCode).first<ExchangeRateRow>()) ?? undefined
  } catch {
    return undefined
  }
}

async function writeRate(
  env: TrolleyScoutEnv,
  currencyCode: string,
  rate: number,
  rateDate: string | undefined,
  fetchedAt: string,
): Promise<void> {
  if (!env.DB) return
  try {
    await env.DB.prepare(
      `INSERT INTO country_exchange_rates (currency_code, rate_from_zar, rate_date, fetched_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (currency_code) DO UPDATE SET
          rate_from_zar = excluded.rate_from_zar,
          rate_date = excluded.rate_date,
          fetched_at = excluded.fetched_at`,
    ).bind(currencyCode, rate, rateDate ?? null, fetchedAt).run()
  } catch {
    // Pricing can safely fall back to rand when the cache is unavailable.
  }
}

function cachedRate(row: ExchangeRateRow | undefined) {
  return row
    ? { rate: row.rate_from_zar, updatedAt: row.rate_date ?? row.fetched_at }
    : undefined
}
