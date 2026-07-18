import { describe, expect, it } from 'vitest'
import {
  SA_PROPERTY_LOCATIONS,
  nearestSaLocation,
  resolveSaLocation,
  toPrivatePropertyLocation,
  toProperty24Location,
} from './saPropertyLocations'

describe('SA property location catalogue', () => {
  it('covers all nine provinces with coordinates and at least one portal id', () => {
    const provinces = new Set(SA_PROPERTY_LOCATIONS.map((l) => l.province))
    expect(provinces.size).toBeGreaterThanOrEqual(9)
    for (const loc of SA_PROPERTY_LOCATIONS) {
      expect(Number.isFinite(loc.lat) && Number.isFinite(loc.lon)).toBe(true)
      expect(Boolean(loc.p24) || Boolean(loc.pp)).toBe(true)
    }
  })
})

describe('resolveSaLocation', () => {
  it('resolves an exact city name', () => {
    expect(resolveSaLocation('Sandton')?.name).toBe('Sandton')
  })
  it('is case- and punctuation-insensitive', () => {
    expect(resolveSaLocation('  cape TOWN ')?.name).toBe('Cape Town')
  })
  it('resolves common aliases', () => {
    expect(resolveSaLocation('joburg')?.name).toBe('Johannesburg')
    expect(resolveSaLocation('jhb')?.name).toBe('Johannesburg')
    expect(resolveSaLocation('CPT')?.name).toBe('Cape Town')
    expect(resolveSaLocation('pmb')?.name).toBe('Pietermaritzburg')
  })
  it('maps Gqeberha to the Port Elizabeth entry with the correct P24 city id', () => {
    const loc = resolveSaLocation('gqeberha')
    expect(loc?.name).toBe('Port Elizabeth')
    expect(loc?.p24?.id).toBe(270)
    expect(loc?.p24?.type).toBe(2)
  })
  it('returns undefined for an unknown place', () => {
    expect(resolveSaLocation('zzz not a place')).toBeUndefined()
  })
})

describe('nearestSaLocation', () => {
  it('finds Cape Town from CBD coordinates', () => {
    expect(nearestSaLocation(-33.918, 18.423)?.name).toBe('Cape Town')
  })
  it('finds a Gauteng city from Johannesburg coordinates', () => {
    const near = nearestSaLocation(-26.2041, 28.0473)
    expect(near?.province).toBe('Gauteng')
  })
  it('finds Durban from KZN coast coordinates', () => {
    expect(nearestSaLocation(-29.8587, 31.0218)?.name).toBe('Durban')
  })
})

describe('portal location mappers', () => {
  it('builds a Property24 location with normalized fields', () => {
    const loc = resolveSaLocation('Cape Town')!
    const p24 = toProperty24Location(loc)
    expect(p24).toMatchObject({ id: 432, type: 2, normalizedName: 'capetown' })
  })
  it('builds a Private Property location', () => {
    const loc = resolveSaLocation('Cape Town')!
    expect(toPrivatePropertyLocation(loc)).toMatchObject({ id: 55, name: 'Cape Town' })
  })
})
