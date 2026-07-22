import type { ReactNode } from 'react'
import {
  Calculator,
  GraduationCap,
  Lightning,
  Storefront,
  Tag,
} from '@phosphor-icons/react'
import { meaningfulWasPrice } from '../services/priceDisplay'
import type { CountryOption, DiscoveredDeal } from '../types'

export type HomeDestination = 'tools' | 'discovery' | 'sources'

const SOUTH_AFRICA: CountryOption = {
  code: 'ZA',
  currencyCode: 'ZAR',
  flag: '',
  name: 'South Africa',
}

export function HomeView({
  country = SOUTH_AFRICA,
  isCheckingStaples = false,
  onOpen,
  stapleDeals = [],
}: {
  country?: CountryOption
  isCheckingStaples?: boolean
  onOpen: (destination: HomeDestination) => void
  stapleDeals?: DiscoveredDeal[]
}) {
  const isSouthAfrica = country.code === 'ZA'

  return (
    <div className="home-view">
      <section className="home-hero" aria-label="What Trolley Scout does">
        <div className="home-hero-copy">
          <p className="eyebrow">
            {country.flag ? `${country.flag} ` : ''}For households in {country.name}
          </p>
          <h1>
            Stretch <mark>every budget</mark>.
            <br />
            Find the right deal.
          </h1>
          <p className="hero-text">
            Trolley Scout searches retailer sites and property platforms for {country.name}. Compare
            prices, browse current catalogues, and find nearby stores and homes without jumping
            between websites.
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
            Free to use. No sign-in needed. Built light so it does not eat your data.
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

      {(stapleDeals.length > 0 || isCheckingStaples) && (
        <section className="staple-strip" aria-label="Staples on special">
          <div className="staple-strip-head">
            <div>
              <p className="eyebrow">Straight from official store pages</p>
              <h2>Staples on special right now</h2>
            </div>
            <button className="ghost-button" onClick={() => onOpen('discovery')} type="button">
              <Tag size={18} />
              All deals
            </button>
          </div>

          {stapleDeals.length > 0 ? (
            <ul className="staple-grid">
              {stapleDeals.map((deal) => (
                <li className="staple-card" key={deal.id}>
                  <p className="staple-retailer">{withoutEmDash(deal.retailerName)}</p>
                  <a href={deal.productUrl} rel="noreferrer" target="_blank">
                    {withoutEmDash(deal.title)}
                  </a>
                  <p className="staple-price">
                    <strong>{withoutEmDash(deal.priceText)}</strong>
                    {meaningfulWasPrice(deal.previousPriceText, deal.priceText) && <span>{withoutEmDash(meaningfulWasPrice(deal.previousPriceText, deal.priceText)!)}</span>}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="staple-checking">Checking today’s staple prices…</p>
          )}
        </section>
      )}

      <section className="home-paths" aria-label="What you can do here">
        <HomePathCard
          icon={<Calculator size={26} weight="duotone" />}
          title="Compare before you buy"
          text="Search the same product across the stores you choose, or compare a whole shopping list side by side before you buy."
          actionLabel="Open tools"
          onClick={() => onOpen('tools')}
        />
        <HomePathCard
          icon={<Tag size={26} weight="duotone" />}
          title="Catch real specials"
          text="Deals pulled straight from official retailer pages, each with its source link. No screenshots, no expired forwards, no guessing."
          actionLabel="Find deals"
          onClick={() => onOpen('discovery')}
        />
        <HomePathCard
          icon={<Storefront size={26} weight="duotone" />}
          title="Go straight to the source"
          text={isSouthAfrica
            ? 'Official specials, catalogue, and free loyalty sign-up pages for 17 major retailers, from Boxer and Usave to Woolworths.'
            : `Official retailer sites, catalogues, and store pages found for ${country.name}.`}
          actionLabel="Browse stores"
          onClick={() => onOpen('sources')}
        />
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
            <strong>Free means free.</strong> Everything a household needs here costs nothing and
            needs no account. Paid plans only add extras for power users.
          </p>
        </div>
      </section>
    </div>
  )
}

function HomePathCard({
  actionLabel,
  icon,
  onClick,
  text,
  title,
}: {
  actionLabel: string
  icon: ReactNode
  onClick: () => void
  text: string
  title: string
}) {
  return (
    <article className="home-path-card">
      {icon}
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="ghost-button" onClick={onClick} type="button">
        {actionLabel}
      </button>
    </article>
  )
}

function withoutEmDash(value: string | undefined): string {
  return value?.replace(/\s*\u2014\s*/g, ': ') ?? ''
}
