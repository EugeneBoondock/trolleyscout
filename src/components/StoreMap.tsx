import { useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { NavigationArrow, X } from '@phosphor-icons/react'
import {
  distanceLabel,
  routeInstruction,
  type StoreRouteStep,
} from '../services/storeNavigation'

const CARTO_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const CARTO_ATTRIBUTION = '&copy; OpenStreetMap contributors &copy; CARTO'

interface StoreMapProps {
  storeName: string
  storeAddress?: string
  lat: number
  lon: number
  onClose: () => void
}

interface LatLon {
  lat: number
  lon: number
}

function pinIcon(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: 'store-map-pin',
    html: `<span style="--pin:${color}">${label}</span>`,
    iconAnchor: [13, 30],
    iconSize: [26, 30],
  })
}

function FitBounds({ store, user }: { store: LatLon; user?: LatLon }) {
  const map = useMap()

  useEffect(() => {
    if (user) {
      map.fitBounds(
        [
          [store.lat, store.lon],
          [user.lat, user.lon],
        ],
        { padding: [48, 48], maxZoom: 16 },
      )
    } else {
      map.setView([store.lat, store.lon], 15)
    }
  }, [map, store.lat, store.lon, user])

  return null
}

export function StoreMap({ storeName, storeAddress, lat, lon, onClose }: StoreMapProps) {
  const watchId = useRef<number | undefined>(undefined)
  const [user, setUser] = useState<LatLon | undefined>()
  const [path, setPath] = useState<Array<[number, number]>>([])
  const [steps, setSteps] = useState<StoreRouteStep[]>([])
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [status, setStatus] = useState<'idle' | 'locating' | 'routing' | 'ready' | 'error'>('idle')
  const [distanceText, setDistanceText] = useState('')
  const [nextDistanceText, setNextDistanceText] = useState('')
  const [navigating, setNavigating] = useState(false)
  const [arrived, setArrived] = useState(false)

  const store = { lat, lon }

  useEffect(() => () => {
    if (watchId.current !== undefined) navigator.geolocation.clearWatch(watchId.current)
  }, [])

  async function routeToStore(startAfterRoute = false) {
    setStatus('locating')
    setArrived(false)

    if (!navigator.geolocation) {
      setStatus('error')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const here = { lat: position.coords.latitude, lon: position.coords.longitude }
        setUser(here)
        setStatus('routing')

        try {
          const response = await fetch(
            `/api/map-route?fromLat=${here.lat}&fromLon=${here.lon}&toLat=${lat}&toLon=${lon}&profile=driving`,
          )
          if (!response.ok) throw new Error('route failed')
          const data = (await response.json()) as {
            data?: {
              path: Array<[number, number]>
              distanceMeters: number
              durationSeconds: number
              steps?: StoreRouteStep[]
            }
          }
          const route = data.data
          const routeSteps = route?.steps ?? []

          if (route?.path?.length) {
            setPath(route.path)
            setSteps(routeSteps)
            setActiveStepIndex(0)
            const km = (route.distanceMeters / 1000).toFixed(1)
            const mins = Math.round(route.durationSeconds / 60)
            setDistanceText(`${km} km · about ${mins} min by car`)
          } else {
            setPath([
              [here.lat, here.lon],
              [lat, lon],
            ])
            setSteps([])
          }
          setStatus('ready')
          if (startAfterRoute) beginNavigation(routeSteps, here)
        } catch {
          setPath([
            [here.lat, here.lon],
            [lat, lon],
          ])
          setSteps([])
          setStatus('ready')
          if (startAfterRoute) beginNavigation([], here)
        }
      },
      () => setStatus('error'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 },
    )
  }

  function updateNavigationPosition(here: LatLon, routeSteps: StoreRouteStep[]) {
    setUser(here)
    const destinationDistance = distanceBetween(here, store)
    if (destinationDistance <= 35) {
      setArrived(true)
      setNavigating(false)
      setNextDistanceText('You have arrived')
      if (watchId.current !== undefined) navigator.geolocation.clearWatch(watchId.current)
      return
    }

    setActiveStepIndex((current) => {
      let next = Math.min(current, Math.max(0, routeSteps.length - 1))
      while (next < routeSteps.length - 1) {
        const location = routeSteps[next]?.location
        if (!location || distanceBetween(here, { lat: location[0], lon: location[1] }) > 35) break
        next += 1
      }
      const location = routeSteps[next]?.location
      const remaining = location
        ? distanceBetween(here, { lat: location[0], lon: location[1] })
        : destinationDistance
      setNextDistanceText(distanceLabel(remaining))
      return next
    })
  }

  function beginNavigation(routeSteps = steps, here = user) {
    if (!navigator.geolocation) {
      setStatus('error')
      return
    }
    if (watchId.current !== undefined) navigator.geolocation.clearWatch(watchId.current)
    setNavigating(true)
    setArrived(false)
    if (here) updateNavigationPosition(here, routeSteps)
    watchId.current = navigator.geolocation.watchPosition(
      (position) => updateNavigationPosition(
        { lat: position.coords.latitude, lon: position.coords.longitude },
        routeSteps,
      ),
      () => setStatus('error'),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 },
    )
  }

  function stopNavigation() {
    if (watchId.current !== undefined) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = undefined
    setNavigating(false)
  }

  const activeInstruction = arrived
    ? `You have arrived at ${storeName}`
    : steps[activeStepIndex]
      ? routeInstruction(steps[activeStepIndex])
      : `Continue to ${storeName}`

  return (
    <div className="store-map-backdrop" onClick={onClose} role="presentation">
      <div
        aria-label={`Map to ${storeName}`}
        className="store-map-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="store-map-head">
          <div>
            <h3>{storeName}</h3>
            {storeAddress && <p>{storeAddress}</p>}
          </div>
          <button aria-label="Close map" className="icon-button" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </div>

        <div className="store-map-canvas">
          <MapContainer center={[lat, lon]} scrollWheelZoom style={{ height: '100%', width: '100%' }} zoom={15}>
            <TileLayer attribution={CARTO_ATTRIBUTION} url={CARTO_TILES} />
            <Marker icon={pinIcon('#c9271b', 'S')} position={[lat, lon]} />
            {user && <Marker icon={pinIcon('#0d6b3d', 'You')} position={[user.lat, user.lon]} />}
            {path.length > 1 && <Polyline color="#c9271b" positions={path} weight={5} />}
            <FitBounds store={store} user={user} />
          </MapContainer>
        </div>

        <div className="store-map-foot">
          {navigating || arrived ? (
            <div className="store-map-guidance" aria-live="polite">
              <span>Trolley Scout navigation</span>
              <strong>{activeInstruction}</strong>
              {nextDistanceText && <small>{nextDistanceText}</small>}
            </div>
          ) : status === 'ready' && distanceText ? (
            <span className="store-map-distance">{distanceText}</span>
          ) : status === 'error' ? (
            <span className="store-map-distance">Allow location to draw and follow your route.</span>
          ) : (
            <span />
          )}
          <div className="store-map-actions">
            {navigating ? (
              <button className="ghost-button" onClick={stopNavigation} type="button">
                End navigation
              </button>
            ) : (
              <>
                <button
                  className="ghost-button"
                  disabled={status === 'locating' || status === 'routing'}
                  onClick={() => routeToStore(false)}
                  type="button"
                >
                  {status === 'locating'
                    ? 'Finding you'
                    : status === 'routing'
                      ? 'Routing'
                      : status === 'ready'
                        ? 'Refresh route'
                        : 'Preview route'}
                </button>
                <button
                  className="primary-button"
                  disabled={status === 'locating' || status === 'routing'}
                  onClick={() => status === 'ready' ? beginNavigation() : routeToStore(true)}
                  type="button"
                >
                  <NavigationArrow size={18} />
                  Start trip
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function distanceBetween(left: LatLon, right: LatLon): number {
  const earthRadius = 6371000
  const lat1 = left.lat * Math.PI / 180
  const lat2 = right.lat * Math.PI / 180
  const deltaLat = (right.lat - left.lat) * Math.PI / 180
  const deltaLon = (right.lon - left.lon) * Math.PI / 180
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
