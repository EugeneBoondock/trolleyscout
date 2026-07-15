import type { ReactNode } from 'react'
import {
  Calculator,
  GraduationCap,
  HandCoins,
  Lightning,
  LinkSimple,
  Storefront,
  Tag,
} from '@phosphor-icons/react'
import {
  foodBasketBenchmark,
  GRANTS_EFFECTIVE_FROM,
  socialGrants,
} from '../data/moneyHelp'

export type HomeDestination = 'help' | 'tools' | 'discovery' | 'sources'

interface TillLine {
  label: string
  value: string
  note?: string
}

const grantById = new Map(socialGrants.map((grant) => [grant.id, grant]))

function grantAmount(id: string): string {
  const grant = grantById.get(id)
  return grant ? formatRandShort(grant.monthlyAmountCents) : ''
}

const tillLines: TillLine[] = [
  { label: 'Child grant, per child', value: `${grantAmount('child-support')}/m` },
  { label: 'Pension (60+)', value: `${grantAmount('older-persons')}/m` },
  { label: 'SRD grant (18–59)', value: `${grantAmount('srd')}/m` },
  { label: 'Grant-in-Aid top-up', value: `${grantAmount('grant-in-aid')}/m` },
  { label: 'School fee exemption', value: 'up to 100%' },
  { label: 'Basic electricity', value: '50 kWh free' },
  { label: 'Loyalty cards, all majors', value: 'R0 to join' },
]

export function HomeView({ onOpen }: { onOpen: (destination: HomeDestination) => void }) {
  return (
    <div className="home-view">
      <section className="home-hero" aria-label="What Trolley Scout does">
        <div className="home-hero-copy">
          <p className="eyebrow">For every household in South Africa</p>
          <h1>
            Stretch <mark>every rand</mark>.
            <br />
            Claim every cent.
          </h1>
          <p className="hero-text">
            Groceries are brutal right now. Trolley Scout puts three things in your pocket: the
            money and help you are already entitled to, tools to pay less at the shelf, and real
            specials from official store pages — never rumours.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => onOpen('help')} type="button">
              <HandCoins size={18} />
              Money you may be missing
            </button>
            <button className="ghost-button" onClick={() => onOpen('tools')} type="button">
              <Calculator size={18} />
              Compare pack prices
            </button>
          </div>
          <p className="home-hero-footnote">
            Free to use. No sign-in needed. Built light so it does not eat your data.
          </p>
        </div>

        <div className="till-slip" role="figure" aria-label="Support many households never claim">
          <header className="till-head">
            <strong>Trolley Scout</strong>
            <span>** money on the table **</span>
            <span className="till-sub">amounts from official sources · per month</span>
          </header>
          <div className="till-rule" aria-hidden="true" />
          <ul className="till-lines">
            {tillLines.map((line) => (
              <li key={line.label}>
                <span className="till-item">{line.label}</span>
                <span className="till-dots" aria-hidden="true" />
                <span className="till-price">{line.value}</span>
              </li>
            ))}
          </ul>
          <div className="till-rule" aria-hidden="true" />
          <footer className="till-foot">
            <span>Grant amounts effective {GRANTS_EFFECTIVE_FROM.slice(0, 7)}</span>
            <button className="till-cta" onClick={() => onOpen('help')} type="button">
              How to claim each line →
            </button>
          </footer>
        </div>
      </section>

      <section className="benchmark-band" aria-label="Food basket benchmark">
        <div>
          <p className="eyebrow">{foodBasketBenchmark.sourceName}</p>
          <h2>
            {foodBasketBenchmark.label}, {foodBasketBenchmark.month}:{' '}
            <span className="benchmark-figure">{formatRandShort(foodBasketBenchmark.totalCents)}</span>
          </h2>
          <p>{foodBasketBenchmark.note}</p>
        </div>
        <a className="benchmark-link" href={foodBasketBenchmark.sourceUrl} rel="noreferrer" target="_blank">
          See the monthly index
          <LinkSimple size={16} />
        </a>
      </section>

      <section className="home-paths" aria-label="What you can do here">
        <HomePathCard
          icon={<HandCoins size={26} weight="duotone" />}
          title="Claim what is yours"
          text="Every SASSA grant with current amounts, school fee exemptions, free basic electricity and water, UIF — with the free, official way to apply."
          actionLabel="Open money help"
          onClick={() => onOpen('help')}
        />
        <HomePathCard
          icon={<Calculator size={26} weight="duotone" />}
          title="Pay less at the shelf"
          text="Type in two pack prices and see which is really cheaper per kilogram or litre. Works offline once loaded — use it right in the aisle."
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
          text="Official specials, catalogue, and free loyalty sign-up pages for 17 major retailers — from Boxer and Usave to Woolworths."
          actionLabel="Browse stores"
          onClick={() => onOpen('sources')}
        />
      </section>

      <section className="home-promises" aria-label="Our promises">
        <div className="home-promise">
          <Lightning size={20} />
          <p>
            <strong>Light on data.</strong> No heavy images, no video, no trackers. The tools keep
            working when your signal does not.
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
          <HandCoins size={20} />
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

function formatRandShort(cents: number): string {
  const rands = cents / 100
  const hasCents = cents % 100 !== 0

  return `R${rands.toLocaleString('en-ZA', {
    maximumFractionDigits: hasCents ? 2 : 0,
    minimumFractionDigits: hasCents ? 2 : 0,
  })}`
}
