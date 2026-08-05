// Keyless walking/driving directions via the public OSRM demo server, proxied
// server-side so the browser never hits CORS and the descriptive User-Agent
// (which OSM-ecosystem services require) is always set. Same approach KinSpace
// uses. Returns the route geometry as [lat, lon] pairs plus distance/duration.

import { isValidCoordinate } from '../../src/services/nearbyStores'
import { json, methodNotAllowed } from '../_shared/respond'

const publicHeaders = {
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=300',
}

const OSRM_ORIGIN = 'https://router.project-osrm.org'

interface OsrmRoute {
  distance?: number
  duration?: number
  geometry?: { coordinates?: Array<[number, number]> }
  legs?: Array<{
    steps?: Array<{
      distance?: number
      duration?: number
      name?: string
      maneuver?: {
        location?: [number, number]
        modifier?: string
        type?: string
      }
    }>
  }>
}

export function mapOsrmRoute(route: OsrmRoute) {
  const path = (route.geometry?.coordinates ?? []).map(([lon, lat]) => [lat, lon])
  const steps = (route.legs ?? []).flatMap((leg) =>
    (leg.steps ?? []).flatMap((step) => {
      const location = step.maneuver?.location
      if (!location) return []
      const [lon, lat] = location
      return [{
        distanceMeters: step.distance ?? 0,
        durationSeconds: step.duration ?? 0,
        location: [lat, lon],
        modifier: step.maneuver?.modifier ?? '',
        name: step.name ?? '',
        type: step.maneuver?.type ?? 'turn',
      }]
    }),
  )
  return {
    distanceMeters: route.distance ?? 0,
    durationSeconds: route.duration ?? 0,
    path,
    steps,
  }
}

export const onRequest: PagesFunction = async ({ request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const url = new URL(request.url)
  const fromLat = Number(url.searchParams.get('fromLat'))
  const fromLon = Number(url.searchParams.get('fromLon'))
  const toLat = Number(url.searchParams.get('toLat'))
  const toLon = Number(url.searchParams.get('toLon'))
  const profile = url.searchParams.get('profile') === 'foot' ? 'foot' : 'driving'

  if (!isValidCoordinate(fromLat, fromLon) || !isValidCoordinate(toLat, toLon)) {
    return json({ message: 'Valid from/to coordinates are required.' }, { headers: publicHeaders, status: 400 })
  }

  const osrmUrl =
    `${OSRM_ORIGIN}/route/v1/${profile}/${fromLon},${fromLat};${toLon},${toLat}` +
    '?overview=full&alternatives=false&steps=true&geometries=geojson'

  try {
    const response = await fetch(osrmUrl, {
      headers: {
        accept: 'application/json',
        'user-agent': 'TrolleyScout/1.0 (+https://trolleyscout.co.za; store directions)',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      return json({ message: 'Route service unavailable.' }, { headers: publicHeaders, status: 502 })
    }

    const payload = (await response.json()) as {
      routes?: OsrmRoute[]
    }
    const route = payload.routes?.[0]

    if (!route?.geometry?.coordinates?.length) {
      return json({ message: 'No route found.' }, { headers: publicHeaders, status: 404 })
    }

    return json(mapOsrmRoute(route), { headers: publicHeaders })
  } catch {
    return json({ message: 'Route service unavailable.' }, { headers: publicHeaders, status: 502 })
  }
}
