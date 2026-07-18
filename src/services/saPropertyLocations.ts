// A baked-in catalogue of major South African property locations with each
// portal's numeric id and coordinates. It lets the Worker resolve a shopper's
// text (or "near me" coordinates) to Property24 and Private Property ids WITHOUT
// calling their bot-blocked autocomplete endpoints at runtime. Harvested from
// the portals' own autocompletes + OpenStreetMap; long-tail suburbs fall back to
// the full Property24 catalogue fetched via the reader proxy (see propertyScout).

import {
  normalizeLocationToken,
  type PrivatePropertyLocation,
  type Property24Location,
} from './propertyPortals'

export interface SaPropertyLocation {
  name: string
  province: string
  lat: number
  lon: number
  p24?: { id: number; type: number; name: string; parent: string }
  pp?: { id: number; name: string; descriptor: string }
}

export const SA_PROPERTY_LOCATIONS: SaPropertyLocation[] = [
  { name: "Cape Town", province: "Western Cape", lat: -33.9288301, lon: 18.4172197, p24: { id: 432, type: 2, name: "Cape Town", parent: "Western Cape" }, pp: { id: 55, name: "Cape Town", descriptor: "Western Cape" } },
  { name: "Stellenbosch", province: "Western Cape", lat: -33.934444, lon: 18.869167, p24: { id: 459, type: 2, name: "Stellenbosch", parent: "Western Cape" }, pp: { id: 712, name: "Stellenbosch", descriptor: "Boland" } },
  { name: "Paarl", province: "Western Cape", lat: -33.7310282, lon: 18.9642117, p24: { id: 344, type: 2, name: "Paarl", parent: "Western Cape" }, pp: { id: 715, name: "Paarl", descriptor: "Boland" } },
  { name: "George", province: "Western Cape", lat: -33.9597212, lon: 22.4587148, p24: { id: 321, type: 2, name: "George", parent: "Western Cape" }, pp: { id: 921, name: "George", descriptor: "Garden Route" } },
  { name: "Knysna", province: "Western Cape", lat: -34.035734, lon: 23.048485, p24: { id: 322, type: 2, name: "Knysna", parent: "Western Cape" }, pp: { id: 923, name: "Knysna", descriptor: "Garden Route" } },
  { name: "Mossel Bay", province: "Western Cape", lat: -34.1832022, lon: 22.1536248, p24: { id: 317, type: 2, name: "Mossel Bay", parent: "Western Cape" }, pp: { id: 924, name: "Mossel Bay", descriptor: "Garden Route" } },
  { name: "Somerset West", province: "Western Cape", lat: -34.0822195, lon: 18.8489342, p24: { id: 390, type: 2, name: "Somerset West", parent: "Western Cape" }, pp: { id: 711, name: "Somerset West", descriptor: "Cape Town" } },
  { name: "Bellville", province: "Western Cape", lat: -33.9064324, lon: 18.6270614, p24: { id: 441, type: 2, name: "Bellville", parent: "Western Cape" }, pp: { id: 737, name: "Bellville", descriptor: "Cape Town" } },
  { name: "Durbanville", province: "Western Cape", lat: -33.8402778, lon: 18.6494444, p24: { id: 439, type: 2, name: "Durbanville", parent: "Western Cape" }, pp: { id: 739, name: "Durbanville", descriptor: "Cape Town" } },
  { name: "Table View", province: "Western Cape", lat: -33.8236111, lon: 18.4902778, p24: { id: 11589, type: 1, name: "Table View", parent: "Blouberg" }, pp: { id: 444, name: "Table View", descriptor: "Blouberg" } },
  { name: "Sea Point", province: "Western Cape", lat: -33.9172222, lon: 18.3922222, p24: { id: 11021, type: 1, name: "Sea Point", parent: "Cape Town" }, pp: { id: 437, name: "Sea Point", descriptor: "Atlantic Seaboard" } },
  { name: "Constantia", province: "Western Cape", lat: -34.0283333, lon: 18.4155556, p24: { id: 11742, type: 1, name: "Constantia", parent: "Cape Town" }, pp: { id: 432, name: "Constantia", descriptor: "Southern Suburbs" } },
  { name: "Hermanus", province: "Western Cape", lat: -34.4175, lon: 19.2361111, p24: { id: 400, type: 2, name: "Hermanus", parent: "Western Cape" }, pp: { id: 742, name: "Hermanus", descriptor: "Overberg" } },
  { name: "Milnerton", province: "Western Cape", lat: -33.8794444, lon: 18.4963889, p24: { id: 433, type: 2, name: "Milnerton", parent: "Western Cape" }, pp: { id: 1399, name: "Milnerton", descriptor: "Cape Town" } },
  { name: "Johannesburg", province: "Gauteng", lat: -26.205, lon: 28.049722, p24: { id: 100, type: 2, name: "Johannesburg", parent: "Gauteng" }, pp: { id: 33, name: "Johannesburg", descriptor: "Gauteng" } },
  { name: "Pretoria", province: "Gauteng", lat: -25.7459277, lon: 28.1879101, p24: { id: 1, type: 2, name: "Pretoria", parent: "Gauteng" }, pp: { id: 28, name: "Pretoria", descriptor: "Gauteng" } },
  { name: "Sandton", province: "Gauteng", lat: -26.0682406, lon: 28.0479844, p24: { id: 109, type: 2, name: "Sandton", parent: "Gauteng" }, pp: { id: 34, name: "Sandton", descriptor: "Johannesburg" } },
  { name: "Randburg", province: "Gauteng", lat: -26.0915852, lon: 28.0020276, p24: { id: 8, type: 2, name: "Randburg", parent: "Gauteng" }, pp: { id: 35, name: "Randburg", descriptor: "Johannesburg" } },
  { name: "Roodepoort", province: "Gauteng", lat: -26.1563889, lon: 27.8858333, p24: { id: 5, type: 2, name: "Roodepoort", parent: "Gauteng" }, pp: { id: 37, name: "Roodepoort", descriptor: "West Rand" } },
  { name: "Centurion", province: "Gauteng", lat: -25.836389, lon: 28.180278, p24: { id: 3, type: 2, name: "Centurion", parent: "Gauteng" }, pp: { id: 32, name: "Centurion", descriptor: "Gauteng" } },
  { name: "Midrand", province: "Gauteng", lat: -25.999262, lon: 28.125912, p24: { id: 16, type: 2, name: "Midrand", parent: "Gauteng" }, pp: { id: 24, name: "Midrand", descriptor: "Johannesburg" } },
  { name: "Soweto", province: "Gauteng", lat: -26.2227778, lon: 27.89, p24: { id: 102, type: 2, name: "Soweto", parent: "Gauteng" }, pp: { id: 25, name: "Soweto", descriptor: "Johannesburg" } },
  { name: "Benoni", province: "Gauteng", lat: -26.1930356, lon: 28.3082376, p24: { id: 22, type: 2, name: "Benoni", parent: "Gauteng" }, pp: { id: 46, name: "Benoni", descriptor: "East Rand" } },
  { name: "Boksburg", province: "Gauteng", lat: -26.2124639, lon: 28.2617471, p24: { id: 20, type: 2, name: "Boksburg", parent: "Gauteng" }, pp: { id: 44, name: "Boksburg", descriptor: "East Rand" } },
  { name: "Kempton Park", province: "Gauteng", lat: -26.0964372, lon: 28.2336325, p24: { id: 12, type: 2, name: "Kempton Park", parent: "Gauteng" }, pp: { id: 42, name: "Kempton Park", descriptor: "East Rand" } },
  { name: "Alberton", province: "Gauteng", lat: -26.2669894, lon: 28.1220546, p24: { id: 19, type: 2, name: "Alberton", parent: "Gauteng" }, pp: { id: 927, name: "Alberton", descriptor: "East Rand" } },
  { name: "Fourways", province: "Gauteng", lat: -26.004472, lon: 28.0042447, p24: { id: 5811, type: 1, name: "Fourways", parent: "Sandton" }, pp: { id: 373, name: "Fourways", descriptor: "Sandton" } },
  { name: "Vanderbijlpark", province: "Gauteng", lat: -26.706891, lon: 27.836271, p24: { id: 105, type: 2, name: "Vanderbijlpark", parent: "Gauteng" }, pp: { id: 814, name: "Vanderbijlpark", descriptor: "Gauteng South" } },
  { name: "Krugersdorp", province: "Gauteng", lat: -26.095556, lon: 27.775556, p24: { id: 7, type: 2, name: "Krugersdorp", parent: "Gauteng" }, pp: { id: 840, name: "Krugersdorp", descriptor: "West Rand" } },
  { name: "Vereeniging", province: "Gauteng", lat: -26.6747222, lon: 27.9261111, p24: { id: 103, type: 2, name: "Vereeniging", parent: "Gauteng" }, pp: { id: 813, name: "Vereeniging", descriptor: "Gauteng South" } },
  { name: "Durban", province: "KwaZulu Natal", lat: -29.861825, lon: 31.009909, p24: { id: 169, type: 2, name: "Durban", parent: "KwaZulu Natal" }, pp: { id: 16, name: "Durban", descriptor: "KwaZulu Natal" } },
  { name: "Umhlanga", province: "KwaZulu Natal", lat: -29.73, lon: 31.0827778, p24: { id: 185, type: 2, name: "Umhlanga", parent: "KwaZulu Natal" }, pp: { id: 1390, name: "Umhlanga", descriptor: "Durban" } },
  { name: "Ballito", province: "KwaZulu Natal", lat: -29.543864, lon: 31.214517, p24: { id: 361, type: 2, name: "Ballito", parent: "KwaZulu Natal" }, pp: { id: 664, name: "Ballito", descriptor: "Dolphin Coast" } },
  { name: "Pietermaritzburg", province: "KwaZulu Natal", lat: -29.6, lon: 30.3788889, p24: { id: 147, type: 2, name: "Pietermaritzburg", parent: "KwaZulu Natal" }, pp: { id: 884, name: "Pietermaritzburg", descriptor: "KZN Midlands" } },
  { name: "Newcastle", province: "KwaZulu Natal", lat: -27.7544581, lon: 29.932561, p24: { id: 138, type: 2, name: "Newcastle", parent: "KwaZulu Natal" }, pp: { id: 2045, name: "Newcastle", descriptor: "Northern KZN" } },
  { name: "Richards Bay", province: "KwaZulu Natal", lat: -28.7707857, lon: 32.0577775, p24: { id: 283, type: 2, name: "Richards Bay", parent: "KwaZulu Natal" }, pp: { id: 15, name: "Richards Bay", descriptor: "Zululand" } },
  { name: "Pinetown", province: "KwaZulu Natal", lat: -29.8142716, lon: 30.8581865, p24: { id: 173, type: 2, name: "Pinetown", parent: "KwaZulu Natal" }, pp: { id: 19, name: "Pinetown", descriptor: "Durban" } },
  { name: "Amanzimtoti", province: "KwaZulu Natal", lat: -30.0497222, lon: 30.8886111, p24: { id: 194, type: 2, name: "Amanzimtoti", parent: "KwaZulu Natal" }, pp: { id: 1388, name: "Amanzimtoti", descriptor: "Durban" } },
  { name: "Port Elizabeth", province: "Eastern Cape", lat: -33.9618598, lon: 25.6186731, p24: { id: 270, type: 2, name: "Gqeberha", parent: "Eastern Cape" }, pp: { id: 67, name: "Port Elizabeth (Gqeberha)", descriptor: "Nelson Mandela Bay" } },
  { name: "East London", province: "Eastern Cape", lat: -33.0191604, lon: 27.8998573, p24: { id: 216, type: 2, name: "East London", parent: "Eastern Cape" }, pp: { id: 66, name: "East London", descriptor: "Amatola" } },
  { name: "Mthatha", province: "Eastern Cape", lat: -31.5895919, lon: 28.787774, p24: { id: 386, type: 2, name: "Mthatha", parent: "Eastern Cape" }, pp: { id: 6354, name: "Mthatha", descriptor: "Wild Coast" } },
  { name: "Uitenhage", province: "Eastern Cape", lat: -33.7678979, lon: 25.3978174, p24: { id: 293, type: 2, name: "Uitenhage", parent: "Eastern Cape" }, pp: { id: 1927, name: "Uitenhage (Kariega)", descriptor: "Nelson Mandela Bay" } },
  { name: "Jeffreys Bay", province: "Eastern Cape", lat: -34.051111, lon: 24.922222, p24: { id: 304, type: 2, name: "Jeffreys Bay", parent: "Eastern Cape" }, pp: { id: 64, name: "Jeffreys Bay", descriptor: "Sunshine Coast" } },
  { name: "Bloemfontein", province: "Free State", lat: -29.116395, lon: 26.215496, p24: { id: 18, type: 2, name: "Bloemfontein", parent: "Free State" }, pp: { id: 63, name: "Bloemfontein", descriptor: "Central Free State" } },
  { name: "Welkom", province: "Free State", lat: -27.982298, lon: 26.737969, p24: { id: 550, type: 2, name: "Welkom", parent: "Free State" }, pp: { id: 657, name: "Welkom", descriptor: "Goldfields" } },
  { name: "Bethlehem", province: "Free State", lat: -28.2308333, lon: 28.3088889, p24: { id: 576, type: 2, name: "Bethlehem", parent: "Free State" }, pp: { id: 656, name: "Bethlehem", descriptor: "Eastern Free State" } },
  { name: "Nelspruit", province: "Mpumalanga", lat: -25.4729094, lon: 30.9772719, p24: { id: 60, type: 2, name: "Nelspruit", parent: "Mpumalanga" }, pp: { id: 887, name: "Nelspruit (Mbombela)", descriptor: "Mpumalanga Lowveld" } },
  { name: "Witbank", province: "Mpumalanga", lat: -25.8762409, lon: 29.2099962, p24: { id: 44, type: 2, name: "Witbank", parent: "Mpumalanga" }, pp: { id: 507, name: "Emalahleni (Witbank) Central", descriptor: "Emalahleni (Witbank)" } },
  { name: "Secunda", province: "Mpumalanga", lat: -26.516111, lon: 29.202778, p24: { id: 110, type: 2, name: "Secunda", parent: "Mpumalanga" }, pp: { id: 6300, name: "Secunda", descriptor: "Mpumalanga Highveld" } },
  { name: "Polokwane", province: "Limpopo", lat: -23.9058333, lon: 29.4613889, p24: { id: 703, type: 2, name: "Polokwane", parent: "Limpopo" }, pp: { id: 1219, name: "Polokwane (Pietersburg)", descriptor: "Limpopo Bushveld" } },
  { name: "Tzaneen", province: "Limpopo", lat: -23.8319444, lon: 30.1611111, p24: { id: 708, type: 2, name: "Tzaneen", parent: "Limpopo" }, pp: { id: 1248, name: "Tzaneen", descriptor: "Limpopo Lowveld" } },
  { name: "Rustenburg", province: "North West", lat: -25.665655, lon: 27.241448, p24: { id: 82, type: 2, name: "Rustenburg", parent: "North West" }, pp: { id: 903, name: "Rustenburg", descriptor: "North West Eastern (Bojanala)" } },
  { name: "Potchefstroom", province: "North West", lat: -26.707778, lon: 27.095833, p24: { id: 125, type: 2, name: "Potchefstroom", parent: "North West" }, pp: { id: 1409, name: "Potchefstroom", descriptor: "North West Southern" } },
  { name: "Klerksdorp", province: "North West", lat: -26.8625383, lon: 26.6656814, p24: { id: 128, type: 2, name: "Klerksdorp", parent: "North West" }, pp: { id: 1411, name: "Klerksdorp", descriptor: "North West Southern" } },
  { name: "Mahikeng", province: "North West", lat: -25.863611, lon: 25.658611, pp: { id: 6335, name: "Mahikeng", descriptor: "North West Central" } },
  { name: "Kimberley", province: "Northern Cape", lat: -28.7383012, lon: 24.7642251, p24: { id: 715, type: 2, name: "Kimberley", parent: "Northern Cape" }, pp: { id: 2193, name: "Kimberley", descriptor: "Diamond Fields" } },
  { name: "Upington", province: "Northern Cape", lat: -28.456325, lon: 21.241867, p24: { id: 530, type: 2, name: "Upington", parent: "Northern Cape" }, pp: { id: 2192, name: "Upington", descriptor: "Green Kalahari" } },
]

// Common local names / abbreviations mapped to a catalogue entry's normalized name.
const ALIASES: Record<string, string> = {
  joburg: 'johannesburg',
  jhb: 'johannesburg',
  jozi: 'johannesburg',
  egoli: 'johannesburg',
  jburg: 'johannesburg',
  pta: 'pretoria',
  tshwane: 'pretoria',
  cpt: 'capetown',
  kaapstad: 'capetown',
  pmb: 'pietermaritzburg',
  maritzburg: 'pietermaritzburg',
  gqeberha: 'portelizabeth',
  pe: 'portelizabeth',
  ibhayi: 'portelizabeth',
  pietersburg: 'polokwane',
  kariega: 'uitenhage',
  emalahleni: 'witbank',
  mbombela: 'nelspruit',
}

export function toProperty24Location(loc: SaPropertyLocation): Property24Location | undefined {
  if (!loc.p24) return undefined
  return {
    id: loc.p24.id,
    name: loc.p24.name,
    parentName: loc.p24.parent,
    type: loc.p24.type,
    normalizedName: normalizeLocationToken(loc.p24.name),
    normalizedParentName: normalizeLocationToken(loc.p24.parent),
  }
}

export function toPrivatePropertyLocation(
  loc: SaPropertyLocation,
): PrivatePropertyLocation | undefined {
  if (!loc.pp) return undefined
  return { id: loc.pp.id, name: loc.pp.name, descriptor: loc.pp.descriptor }
}

/** Resolves free text to a catalogue location (exact → prefix → substring). */
export function resolveSaLocation(query: string): SaPropertyLocation | undefined {
  let token = normalizeLocationToken(query)
  if (!token) return undefined
  if (ALIASES[token]) token = ALIASES[token]
  const key = (loc: SaPropertyLocation) => normalizeLocationToken(loc.name)
  return (
    SA_PROPERTY_LOCATIONS.find((loc) => key(loc) === token) ??
    SA_PROPERTY_LOCATIONS.find((loc) => key(loc).startsWith(token)) ??
    SA_PROPERTY_LOCATIONS.find(
      (loc) => key(loc).includes(token) || (token.length >= 5 && token.includes(key(loc))),
    )
  )
}

/** The catalogue location closest to a coordinate — powers "near me". */
export function nearestSaLocation(lat: number, lon: number): SaPropertyLocation | undefined {
  let best: SaPropertyLocation | undefined
  let bestDistance = Infinity
  for (const loc of SA_PROPERTY_LOCATIONS) {
    const distance = haversineKm(lat, lon, loc.lat, loc.lon)
    if (distance < bestDistance) {
      bestDistance = distance
      best = loc
    }
  }
  return best
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}
