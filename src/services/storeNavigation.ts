export function storeNavigationUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${lat},${lon}`,
    travelmode: 'driving',
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}
