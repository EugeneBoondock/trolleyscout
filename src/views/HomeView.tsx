import type { ReactNode } from 'react'
import {
  ArrowRight,
  Calculator,
  GooglePlayLogo,
  GraduationCap,
  Lightning,
  MapPinLine,
  Storefront,
  Tag,
  Ticket,
} from '@phosphor-icons/react'
import { meaningfulWasPrice } from '../services/priceDisplay'
import type { CountryOption, DiscoveredDeal } from '../types'

export type HomeDestination = 'discovery' | 'near' | 'sources' | 'tools' | 'vouchers'

// The Android build ships through Google Play. Declared once so the badge here
// and the MobileApplication entry in index.html always name the same listing.
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=za.co.trolleyscout.trolley_scout'

const SOUTH_AFRICA: CountryOption = {
  code: 'ZA',
  currencyCode: 'ZAR',
  flag: '',
  name: 'South Africa',
}

// A handful of country names read as a phrase rather than a place, so they
// need a definite article: "across the United States", not "across United
// States". Everything else is used as given.
const COUNTRY_NAMES_TAKING_THE = new Set([
  'Central African Republic',
  'Czech Republic',
  'Dominican Republic',
  'Netherlands',
  'Philippines',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
])

function countryPhrase(name: string): string {
  return COUNTRY_NAMES_TAKING_THE.has(name) ? `the ${name}` : name
}

// The mall's departments. `needsAccount` marks the aisles that sit behind the
// free sign-in gate so nobody walks into a wall without warning.
type Department = {
  action: string
  icon: ReactNode
  needsAccount?: boolean
  text: string
  title: string
  to: HomeDestination
}

const DEPARTMENTS: Department[] = [
  {
    action: 'Browse deals',
    icon: <Tag size={26} weight="duotone" />,
    text: 'This week’s specials pulled straight from official retailer pages, each one carrying the link it came from.',
    title: 'Grocery specials',
    to: 'discovery',
  },
  {
    action: 'Open the map',
    icon: <MapPinLine size={26} weight="duotone" />,
    needsAccount: true,
    text: 'Supermarkets around you, with the deals and catalogues each branch is running right now.',
    title: 'Stores near me',
    to: 'near',
  },
  {
    action: 'Browse stores',
    icon: <Storefront size={26} weight="duotone" />,
    text: 'Specials pages, catalogues, and free loyalty sign-ups, gathered so you never trust a forwarded screenshot.',
    title: 'Store directory',
    to: 'sources',
  },
  {
    action: 'See vouchers',
    icon: <Ticket size={26} weight="duotone" />,
    text: 'Retailer vouchers we have checked, with the terms and the expiry date shown before you claim.',
    title: 'Vouchers',
    to: 'vouchers',
  },
  {
    action: 'Open tools',
    icon: <Calculator size={26} weight="duotone" />,
    needsAccount: true,
    text: 'Put the same product side by side across the stores you choose, or price a whole shopping list at once.',
    title: 'Price tools',
    to: 'tools',
  },
]

export function HomeView({
  catalogueCount = 0,
  country = SOUTH_AFRICA,
  dealCount = 0,
  isCheckingStaples = false,
  onOpen,
  retailerCount = 0,
  sourceCount = 0,
  stapleDeals = [],
}: {
  catalogueCount?: number
  country?: CountryOption
  dealCount?: number
  isCheckingStaples?: boolean
  onOpen: (destination: HomeDestination) => void
  retailerCount?: number
  sourceCount?: number
  stapleDeals?: DiscoveredDeal[]
}) {
  // Only counts we actually hold get a plinth. An empty floor is better than a
  // decorative zero.
  const figures = [
    { label: 'Retailers in the directory', value: retailerCount },
    { label: 'Official source links', value: sourceCount },
    { label: 'Deals in this check', value: dealCount },
    { label: 'Catalogues open now', value: catalogueCount },
  ].filter((figure) => figure.value > 0)

  return (
    <div className="home-view">
      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-copy">
          <p className="eyebrow">
            {country.flag ? `${country.flag} ` : ''}For households in {countryPhrase(country.name)}
          </p>
          <h1 id="home-hero-title">
            Stretch <mark>every budget</mark>.
            <br />
            Find the right deal.
          </h1>
          <p className="hero-text">
            One place for the specials, catalogues, and store prices across{' '}
            {countryPhrase(country.name)}. Every
            amount you see here links back to the retailer page it was read from.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => onOpen('discovery')} type="button">
              <Tag size={18} />
              Find grocery deals
            </button>
            <button className="ghost-button" onClick={() => onOpen('tools')} type="button">
              <Calculator size={18} />
              Compare store prices
            </button>
          </div>
          <p className="home-hero-footnote">
            Core deals are open to everyone. A free account keeps tools and lists across devices.
            No card needed.
          </p>
        </div>

        <div className="home-hero-media">
          <img
            alt="Shopper comparing grocery prices on her phone beside a full trolley"
            decoding="async"
            fetchPriority="high"
            height="945"
            src="/trolley-scout-hero-shopping.jpg"
            width="1696"
          />
        </div>
      </section>

      <section className="mall-directory" aria-labelledby="mall-directory-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Where do you want to start</p>
            <h2 id="mall-directory-title">Browse the aisles</h2>
          </div>
        </div>
        <ul className="mall-departments">
          {DEPARTMENTS.map((department) => (
            <li key={department.to}>
              <button
                className="mall-department"
                onClick={() => onOpen(department.to)}
                type="button"
              >
                <span className="mall-department-icon">{department.icon}</span>
                <span className="mall-department-title">
                  {department.title}
                  {department.needsAccount && (
                    <span className="mall-department-tag">Free account</span>
                  )}
                </span>
                <span className="mall-department-text">{department.text}</span>
                <span className="mall-department-action">
                  {department.action}
                  <ArrowRight size={16} weight="bold" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {(stapleDeals.length > 0 || isCheckingStaples) && (
        <section className="staple-strip" aria-labelledby="staple-strip-title">
          <div className="staple-strip-head section-heading">
            <div>
              <p className="eyebrow">Straight from official store pages</p>
              <h2 id="staple-strip-title">Staples on special right now</h2>
            </div>
            <button className="ghost-button" onClick={() => onOpen('discovery')} type="button">
              <Tag size={18} />
              All deals
            </button>
          </div>

          {stapleDeals.length > 0 ? (
            <ul className="mall-shelf">
              {stapleDeals.map((deal) => (
                <li key={deal.id}>
                  <DealTile deal={deal} />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mall-shelf" aria-hidden="true">
              {[0, 1, 2].map((slot) => (
                <li key={slot}>
                  <span className="deal-tile is-loading" />
                </li>
              ))}
            </ul>
          )}
          {stapleDeals.length === 0 && (
            <p className="staple-checking" role="status">
              Checking today’s staple prices…
            </p>
          )}
        </section>
      )}

      {figures.length > 0 && (
        <section className="mall-figures" aria-labelledby="mall-figures-title">
          <div className="mall-figures-copy">
            <p className="eyebrow">The floor, right now</p>
            <h2 id="mall-figures-title">What the Scout is watching</h2>
            <p className="section-lede">
              These are live counts from this visit, not a brochure. They move as retailers publish,
              pull, and reprice their specials.
            </p>
          </div>
          <ul className="mall-figure-stack">
            {figures.map((figure) => (
              <li className="mall-figure" key={figure.label}>
                <span className="mall-figure-face">
                  <strong>{figure.value.toLocaleString('en-ZA')}</strong>
                  <span>{figure.label}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mall-app" aria-labelledby="mall-app-title">
        <div className="mall-app-copy">
          <p className="eyebrow">Take the aisles with you</p>
          <h2 id="mall-app-title">The Trolley Scout Android app</h2>
          <p>
            The same deals, catalogues, and lists, built for the phone in your pocket. Saved lists
            follow your free account across devices.
          </p>
        </div>
        <a
          className="play-badge"
          href={PLAY_STORE_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          <GooglePlayLogo aria-hidden="true" size={30} weight="fill" />
          <span className="play-badge-copy">
            <span className="play-badge-lead">Get it on</span>
            <span className="play-badge-word">Google Play</span>
          </span>
        </a>
      </section>

      <section className="home-promises" aria-label="Our promises">
        <div className="home-promise">
          <Lightning size={20} />
          <p>
            <strong>Light on data.</strong> Images are optimized, videos never autoplay, and there
            are no ad trackers. The comparison tools stay quick on mobile connections.
          </p>
        </div>
        <div className="home-promise">
          <GraduationCap size={20} />
          <p>
            <strong>Sources, always.</strong> Every amount on this site links to the official page
            it came from, with the date we checked it.
          </p>
        </div>
        <div className="home-promise">
          <Storefront size={20} />
          <p>
            <strong>Free means free.</strong> Household tools and saved lists cost nothing. A free
            account keeps them private and available across devices. Paid plans add extras for
            power users.
          </p>
        </div>
      </section>
    </div>
  )
}

// A single storefront tile. The whole tile is one link to the retailer page the
// price was read from, so there is never a price without its source.
function DealTile({ deal }: { deal: DiscoveredDeal }) {
  const wasPrice = meaningfulWasPrice(deal.previousPriceText, deal.priceText)
  const retailer = withoutEmDash(deal.retailerName)
  const title = withoutEmDash(deal.title)

  return (
    <a className="deal-tile" href={deal.productUrl} rel="noreferrer" target="_blank">
      <span className="deal-tile-media">
        {deal.imageUrl ? (
          // Decorative: the product name sits right beside it in the tile.
          <img alt="" decoding="async" loading="lazy" src={deal.imageUrl} />
        ) : (
          <Storefront aria-hidden="true" size={30} weight="duotone" />
        )}
      </span>
      <span className="deal-tile-body">
        <span className="deal-tile-retailer">{retailer}</span>
        <span className="deal-tile-title">{title}</span>
        <span className="deal-tile-price">
          <strong>{withoutEmDash(deal.priceText)}</strong>
          {wasPrice && <s>{withoutEmDash(wasPrice)}</s>}
        </span>
        {deal.savingText && (
          <span className="deal-tile-saving">{withoutEmDash(deal.savingText)}</span>
        )}
      </span>
      <span className="deal-tile-cue">
        View at {retailer}
        <ArrowRight size={15} weight="bold" />
      </span>
    </a>
  )
}

function withoutEmDash(value: string | undefined): string {
  return value?.replace(/\s*\u2014\s*/g, ': ') ?? ''
}
