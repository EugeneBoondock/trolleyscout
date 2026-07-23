// Turn a typed address or suburb into coordinates so Near me can search
// anywhere, not just where the phone is. The Geoapify key is server-only, so
// this endpoint is the app's only path to it. Results are filtered and biased
// to the member's active country, including an admin's test-country override.

import { isValidCoordinate } from '../../src/services/nearbyStores'
import type { TrolleyScoutEnv } from '../_shared/env'
import { json, methodNotAllowed } from '../_shared/respond'
import { countryFromCode, detectRequestCountry } from '../_shared/countryContext'
import { getMemberSession } from '../_shared/memberStore'

const publicHeaders = {
  'access-control-allow-origin': '*',
  'cache-control': 'private, no-store',
}

interface GeocodeMatch {
  lat: number
  lon: number
  formatted: string
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const query = (new URL(request.url).searchParams.get('q') ?? '').trim()

  if (query.length < 3) {
    return json(
      { matches: [], message: 'Type an address, suburb, or town to search.' },
      { headers: publicHeaders, status: 400 },
    )
  }

  if (!env.GEOAPIFY_API_KEY) {
    return json(
      { matches: [], message: 'Address search is not available right now.' },
      { headers: publicHeaders, status: 503 },
    )
  }

  const session = await getMemberSession(env, request)
  const detected = detectRequestCountry(request)
  const country = countryFromCode(session.account?.countryCode ?? detected.code)
  const matches = await geocode(query, country.code, env.GEOAPIFY_API_KEY)

  if (matches.length === 0) {
    return json(
      { matches: [], message: 'We could not find that address. Try a suburb or town.' },
      { headers: publicHeaders },
    )
  }

  return json({ match: matches[0], matches }, { headers: publicHeaders })
}

async function geocode(
  text: string,
  countryCode: string,
  apiKey: string,
): Promise<GeocodeMatch[]> {
  const url = buildGeoapifyGeocodeUrl(text, countryCode, apiKey)

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
    })

    if (!response.ok) {
      return []
    }

    const payload = (await response.json()) as { results?: unknown }
    const results = Array.isArray(payload.results) ? payload.results : []

    return results
      .map(toMatch)
      .filter((match): match is GeocodeMatch => match !== undefined)
      .slice(0, 5)
  } catch {
    return []
  }
}

export function buildGeoapifyGeocodeUrl(
  text: string,
  countryCode: string,
  apiKey: string,
): string {
  const normalizedCountry = /^[A-Z]{2}$/i.test(countryCode.trim())
    ? countryCode.trim().toLowerCase()
    : 'za'
  const params = new URLSearchParams({
    apiKey,
    bias: `countrycode:${normalizedCountry}`,
    filter: `countrycode:${normalizedCountry}`,
    format: 'json',
    limit: '5',
    text,
  })

  return `https://api.geoapify.com/v1/geocode/search?${params.toString()}`
}

function toMatch(value: unknown): GeocodeMatch | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const record = value as Record<string, unknown>
  const lat = Number(record.lat)
  const lon = Number(record.lon)

  if (!isValidCoordinate(lat, lon)) {
    return undefined
  }

  const formatted =
    typeof record.formatted === 'string' && record.formatted.trim()
      ? record.formatted.trim()
      : [record.address_line1, record.address_line2]
          .filter((part) => typeof part === 'string' && part)
          .join(', ') || 'Selected location'

  return { formatted, lat, lon }
}
