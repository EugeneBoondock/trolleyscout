export interface StoreRouteStep {
  type: string
  modifier: string
  name: string
  distanceMeters?: number
  durationSeconds?: number
  location?: [number, number]
}

export function routeInstruction(step: Pick<StoreRouteStep, 'type' | 'modifier' | 'name'>): string {
  const type = step.type.toLowerCase()
  const modifier = step.modifier.toLowerCase().replaceAll('_', ' ')
  const road = step.name.trim()
  const onto = road ? ` onto ${road}` : ''

  if (type === 'arrive') {
    return modifier === 'left' || modifier === 'right'
      ? `Your destination is on the ${modifier}`
      : 'You have arrived'
  }
  if (type === 'depart') {
    return road ? `Head ${modifier || 'ahead'} on ${road}` : 'Start your trip'
  }
  if (type.includes('roundabout') || type === 'rotary') {
    return road ? `Take the roundabout onto ${road}` : 'Enter the roundabout'
  }
  if (type === 'merge') return `Merge ${modifier || 'ahead'}${onto}`
  if (type === 'fork') return `Keep ${modifier || 'ahead'}${onto}`
  if (type.includes('ramp')) return `Take the ${modifier || 'next'} ramp${onto}`
  if (type === 'continue' || type === 'new name') {
    return `Continue ${modifier || 'straight'}${onto}`
  }
  return `Turn ${modifier || 'ahead'}${onto}`
}

export function distanceLabel(meters: number): string {
  if (meters < 1000) return `${Math.max(0, Math.round(meters / 10) * 10)} m`
  return `${(meters / 1000).toFixed(1)} km`
}
