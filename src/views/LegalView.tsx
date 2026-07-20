import { ShieldCheck } from '@phosphor-icons/react'
import { LEGAL_DOCS, type LegalDocId } from '../data/legalContent'

interface LegalViewProps {
  docId: LegalDocId
  onOpenSupport: () => void
}

// Renders any of the first-party legal documents from a single source of truth
// (legalContent.ts), so Privacy, Terms and Cookies stay visually consistent and
// the wording lives in one reviewable place.
export function LegalView({ docId, onOpenSupport }: LegalViewProps) {
  const doc = LEGAL_DOCS[docId]

  return (
    <article className="legal-view">
      <section className="member-section-head">
        <div>
          <p className="eyebrow">Legal</p>
          <h1>{doc.title}</h1>
          <p className="section-lede">{doc.lede}</p>
          <p className="legal-updated">Last updated: {doc.updated}</p>
        </div>
      </section>

      <div className="legal-body">
        {doc.sections.map((section) => (
          <section className="legal-section" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.body.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </section>
        ))}
      </div>

      <section className="legal-contact" aria-label="Contact">
        <ShieldCheck size={22} weight="duotone" />
        <p>
          Questions about this policy? Reach us through the{' '}
          <button className="link-button" onClick={onOpenSupport} type="button">
            Support page
          </button>{' '}
          and we will get back to you.
        </p>
      </section>
    </article>
  )
}
