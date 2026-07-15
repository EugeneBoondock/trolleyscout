import { CaretDown, HandCoins, LinkSimple, ShieldCheck, Storefront } from '@phosphor-icons/react'
import {
  GRANTS_CHECKED_ON,
  GRANTS_EFFECTIVE_FROM,
  moneyGuides,
  socialGrants,
  zeroRatedFoods,
} from '../data/moneyHelp'

export function MoneyHelpView({ onOpenSources }: { onOpenSources: () => void }) {
  return (
    <div className="help-view">
      <section className="member-section-head">
        <div>
          <p className="eyebrow">Money help</p>
          <h1>Money you may be missing</h1>
          <p className="section-lede">
            Millions of rands in grants, exemptions, and free services go unclaimed every month
            because people were never told. Everything below is free to claim, and every amount
            links to its official source.
          </p>
        </div>
      </section>

      <section className="grant-section" aria-label="Social grants">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SASSA grants</p>
            <h2>Current grant amounts</h2>
          </div>
          <HandCoins size={28} weight="duotone" />
        </div>

        <div className="grant-table" role="table" aria-label="Grant amounts per month">
          <div className="grant-table-head" role="row">
            <span role="columnheader">Grant</span>
            <span role="columnheader">Per month</span>
          </div>
          {socialGrants.map((grant) => (
            <details className="grant-row" key={grant.id}>
              <summary>
                <span className="grant-name">{grant.name}</span>
                <span className="grant-amount">{formatRand(grant.monthlyAmountCents)}</span>
                <CaretDown size={16} className="grant-caret" aria-hidden="true" />
              </summary>
              <div className="grant-detail">
                <p>
                  <strong>Who qualifies:</strong> {grant.whoQualifies}
                </p>
                <p>
                  <strong>How to apply:</strong> {grant.howToApply}
                </p>
                {grant.amountNote && <p className="grant-note">{grant.amountNote}</p>}
                <a href={grant.officialUrl} rel="noreferrer" target="_blank">
                  Official SASSA page
                  <LinkSimple size={14} />
                </a>
              </div>
            </details>
          ))}
        </div>

        <p className="source-stamp">
          Amounts effective {GRANTS_EFFECTIVE_FROM} · checked against the Department of Social
          Development on {GRANTS_CHECKED_ON} · amounts change every April — always confirm on{' '}
          <a href="https://www.sassa.gov.za/" rel="noreferrer" target="_blank">
            sassa.gov.za
          </a>
        </p>

        <div className="fraud-warning" role="note">
          <ShieldCheck size={22} weight="duotone" />
          <p>
            <strong>Applying is always free.</strong> SASSA never charges to process, unblock, or
            speed up a grant. Never share your PIN. Report fraud free on 0800 601 011.
          </p>
        </div>
      </section>

      <section className="guide-section" aria-label="Money guides">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Step by step</p>
            <h2>Guides that put money back</h2>
          </div>
        </div>

        <div className="guide-list">
          {moneyGuides.map((guide) => (
            <details className="guide-card" key={guide.id}>
              <summary>
                <div>
                  <h3>{guide.title}</h3>
                  <p>{guide.summary}</p>
                </div>
                <CaretDown size={18} className="guide-caret" aria-hidden="true" />
              </summary>
              <div className="guide-body">
                <ol>
                  {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <div className="guide-links">
                  {guide.officialLinks.map((link) =>
                    link.url === '#stores' ? (
                      <button
                        className="ghost-button"
                        key={link.url}
                        onClick={onOpenSources}
                        type="button"
                      >
                        <Storefront size={16} />
                        {link.label}
                      </button>
                    ) : (
                      <a href={link.url} key={link.url} rel="noreferrer" target="_blank">
                        {link.label}
                        <LinkSimple size={14} />
                      </a>
                    ),
                  )}
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="vat-section" aria-label="VAT-free foods">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Zero-rated by law</p>
            <h2>{zeroRatedFoods.length} items that carry no VAT</h2>
          </div>
        </div>
        <p className="section-lede">
          Build meals around these and the taxman stays out of your trolley. If VAT shows up on
          any of them on your till slip, query it at the store.
        </p>
        <ul className="vat-grid">
          {zeroRatedFoods.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <p className="help-disclaimer">
        Trolley Scout summarises public information to make it easier to find. It is not legal or
        financial advice, and amounts change — the official links above are always the final word.
      </p>
    </div>
  )
}

function formatRand(cents: number): string {
  const rands = cents / 100
  const hasCents = cents % 100 !== 0

  return `R${rands.toLocaleString('en-ZA', {
    maximumFractionDigits: hasCents ? 2 : 0,
    minimumFractionDigits: hasCents ? 2 : 0,
  })}`
}
