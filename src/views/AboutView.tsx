import type { ReactNode } from 'react'
import {
  CaretDown,
  HandCoins,
  Info,
  MagnifyingGlass,
  ShieldCheck,
  Storefront,
  Tag,
} from '@phosphor-icons/react'

export type AboutDestination = 'help' | 'tools' | 'discovery' | 'sources'

interface Faq {
  question: string
  answer: ReactNode
}

const faqs: Faq[] = [
  {
    question: 'Why don’t I see every product from every shop?',
    answer:
      'Some big shops (Shoprite, Checkers) only publish a printed catalogue online, not a live product list. For those we show the current catalogue with its dates. For shops with a live product feed (Pick n Pay, Clicks, Dis-Chem and more) we show real prices and savings. We only ever show what comes from the shop’s own official page — never a guess.',
  },
  {
    question: 'Why did a price not match the shop?',
    answer:
      'Prices change often and specials expire. Every deal shows when it was last checked, and the board refreshes automatically. If a price looks off, open the “Product” link to see the shop’s live page, and use Check now to force a fresh pull.',
  },
  {
    question: 'Is it really free?',
    answer:
      'Yes. All the money help, the price tools, live deals, and store catalogues are free and need no account. Paid plans only add bigger saved-deal and basket lists for power savers — and they help keep the essentials free for everyone.',
  },
  {
    question: 'Which shops are covered?',
    answer:
      'Live product prices: Pick n Pay, Clicks, Dis-Chem, Takealot, Amazon, Yuppiechef. Weekly catalogues: Shoprite, Checkers, Boxer, Usave, OK Foods, Frontline Hyper, President Hyper, Kit Kat, and more — and we keep adding. Ask for a shop and we’ll try to add it.',
  },
  {
    question: 'How is my money help kept accurate?',
    answer:
      'Every grant amount, exemption, and right links to the official government or retailer page it came from, with the date we checked it. Grant amounts change each April — always confirm on the official site before you act.',
  },
]

export function AboutView({ onOpen }: { onOpen: (destination: AboutDestination) => void }) {
  return (
    <div className="about-view">
      <section className="member-section-head">
        <div>
          <p className="eyebrow">About &amp; help</p>
          <h1>How Trolley Scout works</h1>
          <p className="section-lede">
            One place to stretch every rand: money you can claim, tools to pay less, and real
            specials from official shop pages. Here’s how to use each part.
          </p>
        </div>
      </section>

      <section className="about-steps" aria-label="What you can do">
        <AboutStep
          icon={<HandCoins size={26} weight="duotone" />}
          title="1. Claim what is yours"
          text="Open Money help for every SASSA grant, school-fee exemptions, free basic electricity, and UIF — with the free, official way to apply."
          actionLabel="Open money help"
          onClick={() => onOpen('help')}
        />
        <AboutStep
          icon={<Tag size={26} weight="duotone" />}
          title="2. Find real specials"
          text="Open Deals to see live prices and this week’s store catalogues. Use the search box to filter to what you actually buy. Every row links to the shop’s own page."
          actionLabel="Find deals"
          onClick={() => onOpen('discovery')}
        />
        <AboutStep
          icon={<MagnifyingGlass size={26} weight="duotone" />}
          title="3. Pay less at the shelf"
          text="Open Tools to compare pack sizes by price per kilogram or litre — the big pack is not always the cheaper one. Works offline once loaded."
          actionLabel="Open tools"
          onClick={() => onOpen('tools')}
        />
        <AboutStep
          icon={<Storefront size={26} weight="duotone" />}
          title="4. Go to the source"
          text="Open Stores for official specials, catalogue, and free loyalty sign-up pages for every major retailer, so you never rely on a forwarded screenshot."
          actionLabel="Browse stores"
          onClick={() => onOpen('sources')}
        />
      </section>

      <section className="about-promise" aria-label="Our promise">
        <ShieldCheck size={24} weight="duotone" />
        <p>
          <strong>Source-first, always.</strong> Every price, catalogue, and grant amount comes
          from an official page and shows when it was checked. We never invent a number, and we’re
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
        Missing a shop, or spotted a wrong price? That feedback is how the coverage grows — the
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
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="ghost-button" onClick={onClick} type="button">
        {actionLabel}
      </button>
    </article>
  )
}
