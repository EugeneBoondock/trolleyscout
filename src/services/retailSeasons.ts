import type { DiscoveredDeal } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

export interface RetailHoliday {
  date: string
  localName?: string
  name: string
}

export type RetailSeasonIcon =
  | 'calendar'
  | 'gift'
  | 'graduation'
  | 'travel'
  | 'school'
  | 'tag'

export interface RetailSeason {
  endsOn?: string
  icon: RetailSeasonIcon
  id: string
  searchTerms: readonly string[]
  startsOn?: string
  status: 'active' | 'always' | 'upcoming'
  subtitle: string
  timingLabel: string
  title: string
}

// National dates that matter to South African retail campaigns. The live
// holiday endpoint remains the authority, while this small fallback keeps the
// scout event-aware when that provider is temporarily unavailable.
export function southAfricanRetailHolidayFallback(now = new Date()): RetailHoliday[] {
  return [now.getUTCFullYear(), now.getUTCFullYear() + 1].flatMap((year) => [
    { date: `${year}-03-21`, name: 'Human Rights Day' },
    { date: `${year}-04-27`, name: 'Freedom Day' },
    { date: `${year}-05-01`, name: 'Workers Day' },
    { date: `${year}-06-16`, name: 'Youth Day' },
    { date: `${year}-08-09`, name: 'National Women’s Day' },
    { date: `${year}-09-24`, name: 'Heritage Day' },
    { date: `${year}-12-16`, name: 'Day of Reconciliation' },
  ])
}

const SOUTHERN_SCHOOL_MARKETS = new Set([
  'AR', 'AU', 'BW', 'CL', 'LS', 'MG', 'MU', 'MZ', 'NA', 'NZ', 'SZ', 'ZA', 'ZM', 'ZW',
])

const SEASON_TERMS = {
  blackFriday: [
    'black friday', 'black week', 'cyber monday', 'cyber week', 'black november',
  ],
  christmas: [
    'christmas', 'xmas', 'festive', 'secret santa', 'stocking filler', 'holiday gift',
  ],
  easter: [
    'easter', 'good friday', 'hot cross bun', 'hot cross buns', 'easter egg', 'easter eggs',
  ],
  school: [
    'back to school', 'school uniform', 'school shoes', 'school stationery', 'stationery',
    'lunchbox', 'lunch box', 'backpack', 'school bag', 'notebook', 'exercise book',
  ],
  student: [
    'student discount', 'student deal', 'student offer', 'campus', 'university', 'varsity',
    'unidays', 'student beans', 'textbook', 'study bundle',
  ],
  travel: [
    'flight deal', 'flight deals', 'flight discount', 'flight special', 'flight specials',
    'cheap flight', 'cheap flights', 'airfare', 'air ticket', 'air tickets', 'plane ticket',
    'holiday package', 'holiday packages', 'vacation package', 'vacation packages',
    'travel deal', 'travel deals', 'travel special', 'travel specials',
    'hotel deal', 'hotel deals', 'hotel special', 'hotel specials', 'hotel stay',
    'accommodation deal', 'accommodation special', 'night stay', 'nights stay',
    'bed and breakfast', 'bnb', 'b b', 'resort deal', 'resort special',
    'booking discount', 'booking com', 'getaway', 'getaways', 'cruise deal',
    'car hire deal', 'car rental deal',
  ],
} as const

export function buildRetailSeasons(
  countryCode: string,
  now = new Date(),
  holidays: readonly RetailHoliday[] = [],
): RetailSeason[] {
  const today = startOfUtcDay(now)
  const moments = [
    blackFridayMoment(today),
    christmasMoment(today),
    easterMoment(today),
    backToSchoolMoment(countryCode, today),
    ...holidayMoments(today, holidays),
    travelMoment(),
    studentMoment(),
  ].filter((moment): moment is RetailSeason => Boolean(moment))

  return uniqueMoments(moments)
    .sort((left, right) => seasonSortKey(left, today) - seasonSortKey(right, today))
    .slice(0, 8)
}

export function matchesRetailSeason(
  deal: Pick<
    DiscoveredDeal,
    'evidenceText' | 'retailerName' | 'savingText' | 'sourceLabel' | 'sourceUrl' | 'title'
  >,
  season: RetailSeason,
): boolean {
  const searchable = normalize([
    deal.title,
    deal.retailerName,
    deal.sourceLabel,
    deal.evidenceText,
    deal.savingText,
    deal.sourceUrl,
  ].filter(Boolean).join(' '))

  return season.searchTerms.some((term) => containsTerm(searchable, normalize(term)))
}

export function retailSeasonMatchCount(
  deals: readonly DiscoveredDeal[],
  season: RetailSeason,
): number {
  return deals.reduce((total, deal) => total + Number(matchesRetailSeason(deal, season)), 0)
}

function blackFridayMoment(today: Date): RetailSeason | undefined {
  let date = fourthFriday(today.getUTCFullYear(), 10)
  let end = addDays(date, 3)
  if (end < today) {
    date = fourthFriday(today.getUTCFullYear() + 1, 10)
    end = addDays(date, 3)
  }
  return datedMoment({
    date,
    end,
    icon: 'tag',
    id: `black-friday-${date.getUTCFullYear()}`,
    leadDays: 60,
    searchTerms: SEASON_TERMS.blackFriday,
    subtitle: 'Watch verified Black Friday and Cyber Monday prices before buying.',
    title: 'Black Friday watch',
  }, today)
}

function christmasMoment(today: Date): RetailSeason | undefined {
  let date = utcDate(today.getUTCFullYear(), 11, 25)
  let start = addDays(date, -55)
  let end = utcDate(today.getUTCFullYear() + 1, 0, 2)
  if (end < today) {
    date = utcDate(today.getUTCFullYear() + 1, 11, 25)
    start = addDays(date, -55)
    end = utcDate(today.getUTCFullYear() + 2, 0, 2)
  }
  return rangedMoment({
    end,
    icon: 'gift',
    id: `christmas-${date.getUTCFullYear()}`,
    leadDays: 60,
    searchTerms: SEASON_TERMS.christmas,
    start,
    subtitle: 'Track festive food, gifts and home offers from live store sources.',
    title: 'Festive season',
  }, today)
}

function easterMoment(today: Date): RetailSeason | undefined {
  let easter = easterSunday(today.getUTCFullYear())
  let start = addDays(easter, -45)
  let end = addDays(easter, 1)
  if (end < today) {
    easter = easterSunday(today.getUTCFullYear() + 1)
    start = addDays(easter, -45)
    end = addDays(easter, 1)
  }
  return rangedMoment({
    end,
    icon: 'gift',
    id: `easter-${easter.getUTCFullYear()}`,
    leadDays: 60,
    searchTerms: SEASON_TERMS.easter,
    start,
    subtitle: 'Find verified Easter food and family offers as stores publish them.',
    title: 'Easter savings',
  }, today)
}

function backToSchoolMoment(countryCode: string, today: Date): RetailSeason | undefined {
  const southern = SOUTHERN_SCHOOL_MARKETS.has(countryCode.trim().toUpperCase())
  const year = today.getUTCFullYear()
  let start: Date
  let end: Date

  if (southern) {
    start = utcDate(year - 1, 10, 15)
    end = utcDate(year, 1, 15)
    if (end < today) {
      start = utcDate(year, 10, 15)
      end = utcDate(year + 1, 1, 15)
    }
  } else {
    start = utcDate(year, 6, 15)
    end = utcDate(year, 8, 30)
    if (end < today) {
      start = utcDate(year + 1, 6, 15)
      end = utcDate(year + 1, 8, 30)
    }
  }

  return rangedMoment({
    end,
    icon: 'school',
    id: `back-to-school-${end.getUTCFullYear()}`,
    leadDays: 60,
    searchTerms: SEASON_TERMS.school,
    start,
    subtitle: 'Compare uniforms, stationery, lunch gear and study essentials.',
    title: 'Back-to-school season',
  }, today)
}

function holidayMoments(today: Date, holidays: readonly RetailHoliday[]): RetailSeason[] {
  return holidays
    .map((holiday) => {
      const date = parseIsoDate(holiday.date)
      if (!date || date < today || daysBetween(today, date) > 45) return undefined
      if (/christmas|good friday|easter/i.test(`${holiday.name} ${holiday.localName ?? ''}`)) {
        return undefined
      }
      const names = [holiday.name, holiday.localName].filter(Boolean) as string[]
      return datedMoment({
        date,
        end: date,
        icon: 'calendar',
        id: `holiday-${holiday.date}-${normalize(holiday.name).replace(/ /g, '-')}`,
        leadDays: 45,
        searchTerms: names,
        subtitle: 'See live offers that stores have linked to this public holiday.',
        title: holiday.localName || holiday.name,
      }, today)
    })
    .filter((moment): moment is RetailSeason => Boolean(moment))
    .slice(0, 2)
}

function studentMoment(): RetailSeason {
  return {
    icon: 'graduation',
    id: 'student-offers',
    searchTerms: SEASON_TERMS.student,
    status: 'always',
    subtitle: 'Find verified student pricing for study, tech, data and campus life.',
    timingLabel: 'Available year-round',
    title: 'Student offers',
  }
}

function travelMoment(): RetailSeason {
  return {
    icon: 'travel',
    id: 'travel-deals',
    searchTerms: SEASON_TERMS.travel,
    status: 'always',
    subtitle: 'Compare verified flights, stays, packages, resorts and local getaways.',
    timingLabel: 'Available now',
    title: 'Travel deals',
  }
}

function datedMoment(
  config: {
    date: Date
    end: Date
    icon: RetailSeasonIcon
    id: string
    leadDays: number
    searchTerms: readonly string[]
    subtitle: string
    title: string
  },
  today: Date,
): RetailSeason | undefined {
  return rangedMoment({ ...config, start: config.date }, today)
}

function rangedMoment(
  config: {
    end: Date
    icon: RetailSeasonIcon
    id: string
    leadDays: number
    searchTerms: readonly string[]
    start: Date
    subtitle: string
    title: string
  },
  today: Date,
): RetailSeason | undefined {
  const daysUntil = daysBetween(today, config.start)
  const active = today >= config.start && today <= config.end
  if (!active && (daysUntil < 0 || daysUntil > config.leadDays)) return undefined

  return {
    endsOn: toIsoDate(config.end),
    icon: config.icon,
    id: config.id,
    searchTerms: config.searchTerms,
    startsOn: toIsoDate(config.start),
    status: active ? 'active' : 'upcoming',
    subtitle: config.subtitle,
    timingLabel: active
      ? 'Happening now'
      : daysUntil === 1
        ? 'Starts tomorrow'
        : `Starts in ${daysUntil} days`,
    title: config.title,
  }
}

function uniqueMoments(moments: RetailSeason[]): RetailSeason[] {
  const seen = new Set<string>()
  return moments.filter((moment) => {
    const key = normalize(moment.title)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function seasonSortKey(moment: RetailSeason, today: Date): number {
  if (moment.status === 'active') return -2
  if (moment.status === 'always') return 10_000
  const starts = moment.startsOn ? parseIsoDate(moment.startsOn) : undefined
  return starts ? daysBetween(today, starts) : 9_999
}

function fourthFriday(year: number, month: number): Date {
  const first = utcDate(year, month, 1)
  const firstFridayOffset = (5 - first.getUTCDay() + 7) % 7
  return utcDate(year, month, 1 + firstFridayOffset + 21)
}

// Gregorian computus, returned as a UTC calendar date.
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return utcDate(year, month - 1, day)
}

function containsTerm(searchable: string, term: string): boolean {
  if (!term) return false
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, 'i').test(searchable)
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function parseIsoDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  return utcDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function startOfUtcDay(date: Date): Date {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day))
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

function daysBetween(left: Date, right: Date): number {
  return Math.round((right.getTime() - left.getTime()) / DAY_MS)
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
