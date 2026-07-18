// Turn a typed address or suburb into coordinates so Near me can search
// anywhere, not just where the phone is. The Geoapify key is server-only, so
// this endpoint is the app's only path to it. Nationwide South African search:
// results are filtered to za and biased to the country centroid.

import { isValidCoordinate } from '../../src/services/nearbyStores'
import type { TrolleyScoutEnv } from '../_shared/env'
import { json, methodNotAllowed } from '../_shared/respond'

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

  const matches = await geocode(query, env.GEOAPIFY_API_KEY)

  if (matches.length === 0) {
    return json(
      { matches: [], message: 'We could not find that address. Try a suburb or town.' },
      { headers: publicHeaders },
    )
  }

  return json({ match: matches[0], matches }, { headers: publicHeaders })
}

async function geocode(text: string, apiKey: string): Promise<GeocodeMatch[]> {
  const params = new URLSearchParams({
    apiKey,
    // Bias and filter to South Africa so a bare suburb name resolves nationally.
    bias: 'countrycode:za',
    filter: 'countrycode:za',
    format: 'json',
    limit: '5',
    text,
  })

  try {
    const response = await fetch(`https://api.geoapify.com/v1/geocode/search?${params.toString()}`, {
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
