import { describe, expect, it } from 'vitest'

import { mapOsrmRoute } from '../api/map-route'

describe('mapOsrmRoute', () => {
  it('keeps geometry and turn steps needed by the in-app navigator', () => {
    const route = mapOsrmRoute({
      distance: 1280,
      duration: 240,
      geometry: { coordinates: [[18.4, -33.9], [18.41, -33.91]] },
      legs: [{
        steps: [{
          distance: 320,
          duration: 40,
          name: 'Main Road',
          maneuver: {
            location: [18.4, -33.9],
            modifier: 'right',
            type: 'turn',
          },
        }],
      }],
    })

    expect(route).toEqual({
      distanceMeters: 1280,
      durationSeconds: 240,
      path: [[-33.9, 18.4], [-33.91, 18.41]],
      steps: [{
        distanceMeters: 320,
        durationSeconds: 40,
        location: [-33.9, 18.4],
        modifier: 'right',
        name: 'Main Road',
        type: 'turn',
      }],
    })
  })
})
