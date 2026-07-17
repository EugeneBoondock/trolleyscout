import { useEffect, useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { X } from '@phosphor-icons/react'

// Keyless map: CARTO Voyager basemap tiles + OSRM routing (proxied through our
// own /api/map-route). Markers are inline HTML divIcons so we never depend on
// Leaflet's bundled marker PNGs.
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

// Keeps the map framed on whatever we have — both points if routed, else store.
function FitBounds({ store, user }: { store: LatLon; user?: LatLon }) {
  const map = useMap()

  useEffect(() => {
    if (user) {
      map.fitBounds(
        [
          [store.lat, store.lon],
          [user.lat, user.lon],
        ],
        { padding: [48, 48], maxZoom: 15 },
      )
    } else {
      map.setView([store.lat, store.lon], 15)
    }
  }, [map, store.lat, store.lon, user])

  return null
}

export function StoreMap({ storeName, storeAddress, lat, lon, onClose }: StoreMapProps) {
  const [user, setUser] = useState<LatLon | undefined>()
  const [path, setPath] = useState<Array<[number, number]>>([])
  const [status, setStatus] = useState<'idle' | 'locating' | 'routing' | 'ready' | 'error'>('idle')
  const [distanceText, setDistanceText] = useState('')

  const store = { lat, lon }

  async function routeToStore() {
    setStatus('locating')

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
          if (!response.ok) {
            throw new Error('route failed')
          }
          const data = (await response.json()) as {
            data?: { path: Array<[number, number]>; distanceMeters: number; durationSeconds: number }
          }
          const route = data.data

          if (route?.path?.length) {
            setPath(route.path)
            const km = (route.distanceMeters / 1000).toFixed(1)
            const mins = Math.round(route.durationSeconds / 60)
            setDistanceText(`${km} km · about ${mins} min by car`)
            setStatus('ready')
          } else {
            setStatus('ready')
          }
        } catch {
          // Show the straight-line fallback if routing is unavailable.
          setPath([
            [here.lat, here.lon],
            [lat, lon],
          ])
          setStatus('ready')
        }
      },
      () => setStatus('error'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 },
    )
  }

  const externalMapsUrl = `https://www.openstreetmap.org/directions?to=${lat},${lon}`

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
          {status === 'ready' && distanceText ? (
            <span className="store-map-distance">{distanceText}</span>
          ) : status === 'error' ? (
            <span className="store-map-distance">Allow location to draw the route.</span>
          ) : (
            <span />
          )}
          <div className="store-map-actions">
            <button
              className="ghost-button"
              disabled={status === 'locating' || status === 'routing'}
              onClick={routeToStore}
              type="button"
            >
              {status === 'locating' ? 'Finding you' : status === 'routing' ? 'Routing' : 'Directions from me'}
            </button>
            <a className="primary-button" href={externalMapsUrl} rel="noreferrer" target="_blank">
              Open in Maps
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
