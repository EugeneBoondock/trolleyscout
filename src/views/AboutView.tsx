import type { ReactNode } from 'react'
import {
  CaretDown,
  Info,
  MagnifyingGlass,
  ShieldCheck,
  Storefront,
  Tag,
} from '@phosphor-icons/react'
import { ScoutMascot } from '../components/ScoutMascot'

export type AboutDestination = 'tools' | 'discovery' | 'sources'

interface Faq {
  question: string
  answer: ReactNode
}

const faqs: Faq[] = [
  {
    question: 'Why don’t I see every product from every shop?',
    answer:
      'Some shops publish catalogues instead of a searchable product feed. Trolley Scout shows searchable prices where a source returns them and catalogue pages for the rest. We do not invent missing prices.',
  },
  {
    question: 'Why did a price not match the shop?',
    answer:
      'Prices change often and specials expire. Every deal shows when it was last checked. If a price looks off, open its source link to see the shop’s current page.',
  },
  {
    question: 'Is it really free?',
    answer:
      'Yes. Deal search, store comparison, nearby stores, and catalogues are free. Paid plans add bigger saved-deal and basket limits.',
  },
  {
    question: 'Which shops are covered?',
    answer:
      'The directory changes with the selected country. Trolley Scout uses the known directory first, then scouts for local retailers, official store pages, and catalogue sources in that country.',
  },
]

export function AboutView({ onOpen }: { onOpen: (destination: AboutDestination) => void }) {
  return (
    <div className="about-view">
      <section className="member-section-head about-intro">
        <div>
          <p className="eyebrow">About &amp; help</p>
          <h1>How Trolley Scout works</h1>
          <p className="section-lede">
            One place for current deals, store catalogues, product comparison, nearby stores,
            and property searches. Here’s how to use each part.
          </p>
        </div>
        <ScoutMascot label="Scout, your Trolley Scout guide" pose="wave" size={188} />
      </section>

      <section className="about-steps" aria-label="What you can do">
        <AboutStep
          icon={<Tag size={26} weight="duotone" />}
          title="1. Find real specials"
          text="Open Deals to search live prices and this week’s store catalogues. Save a deal or add it straight to your basket."
          actionLabel="Find deals"
          onClick={() => onOpen('discovery')}
        />
        <AboutStep
          icon={<MagnifyingGlass size={26} weight="duotone" />}
          title="2. Compare across stores"
          text="Open Tools to search the same product across the stores you choose, or compare a whole shopping list side by side."
          actionLabel="Open tools"
          onClick={() => onOpen('tools')}
        />
        <AboutStep
          icon={<Storefront size={26} weight="duotone" />}
          title="3. Browse stores and catalogues"
          text="Open a store card for its local deals and catalogues. Each catalogue opens in Trolley Scout’s page reader."
          actionLabel="Browse stores"
          onClick={() => onOpen('sources')}
        />
      </section>

      <section className="about-promise" aria-label="Our promise">
        <ShieldCheck size={24} weight="duotone" />
        <p>
          <strong>Source-first, always.</strong> Every price and catalogue comes from an official
          page and shows when it was checked. We never invent a number, and we’re
          honest when a shop only publishes a catalogue instead of live prices.
        </p>
      </section>

      <section className="faq-section" aria-label="Frequently asked questions">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Questions</p>
            <h2>Good to know</h2>
          </div>
          <Info size={28} weight="duotone" />
        </div>
        <div className="faq-list">
          {faqs.map((faq) => (
            <details className="faq-card" key={faq.question}>
              <summary>
                <span>{faq.question}</span>
                <CaretDown size={18} className="faq-caret" aria-hidden="true" />
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="about-footnote">
        Missing a shop, or spotted a wrong price? That feedback is how the coverage grows. The
        goal is to be genuinely useful to every household, not to sell subscriptions.
      </p>
    </div>
  )
}

function AboutStep({
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
    <article className="about-step-card">
      {icon}
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="ghost-button" onClick={onClick} type="button">
        {actionLabel}
      </button>
    </article>
  )
}
