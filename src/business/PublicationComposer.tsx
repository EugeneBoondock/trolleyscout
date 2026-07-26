import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarBlank,
  CheckCircle,
  Eye,
  ImageSquare,
  Storefront,
  UploadSimple,
  WarningCircle,
} from '@phosphor-icons/react'
import { BusinessApiError, uploadBusinessImage } from './api'
import { IssueList } from './BusinessFeedback'
import type {
  BusinessLocation,
  BusinessMutationResult,
  BusinessPublication,
  PublicationDraft,
  PublicationKind,
  PublicationPlacement,
} from './types'

interface PublicationComposerProps {
  locations: BusinessLocation[]
  publication?: BusinessPublication
  onCancel: () => void
  onSave: (draft: PublicationDraft, publicationId?: string) => Promise<BusinessMutationResult>
  onSubmit: (publicationId: string) => Promise<BusinessMutationResult>
}

interface EditorState {
  kind: PublicationKind
  placement: PublicationPlacement
  title: string
  bodyText: string
  targetUrl: string
  imageUrl: string
  imageAlt: string
  price: string
  previousPrice: string
  currencyCode: string
  offerText: string
  couponCode: string
  startsAt: string
  endsAt: string
  locationIds: string[]
}

const publicationKinds: Array<{
  id: PublicationKind
  label: string
  detail: string
}> = [
  { id: 'deal', label: 'Deal', detail: 'A product with a current price' },
  { id: 'special', label: 'Special', detail: 'A bundle, multibuy, or member offer' },
  { id: 'promotion', label: 'Promotion', detail: 'A campaign, voucher, launch, or event' },
  { id: 'post', label: 'Post', detail: 'A story or update for Window Shopping' },
]

export function PublicationComposer({
  locations,
  publication,
  onCancel,
  onSave,
  onSubmit,
}: PublicationComposerProps) {
  const [editor, setEditor] = useState<EditorState>(() => stateFromPublication(publication))
  const [preview, setPreview] = useState<'marketplace' | 'window'>(
    publication?.placement === 'window' ? 'window' : 'marketplace',
  )
  const [issues, setIssues] = useState<string[]>([])
  const [notice, setNotice] = useState<string>()
  const [busy, setBusy] = useState<'save' | 'submit'>()
  const [uploading, setUploading] = useState(false)

  const draft = useMemo(() => draftFromEditor(editor), [editor])
  const commercial = editor.kind !== 'post'

  function update<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setIssues([])
    setNotice(undefined)
    setEditor((current) => ({ ...current, [key]: value }))
  }

  function chooseKind(kind: PublicationKind) {
    setEditor((current) => ({
      ...current,
      kind,
      placement: kind === 'post' ? 'window' : current.placement,
    }))
    if (kind === 'post') setPreview('window')
  }

  function toggleLocation(locationId: string) {
    update(
      'locationIds',
      editor.locationIds.includes(locationId)
        ? editor.locationIds.filter((id) => id !== locationId)
        : [...editor.locationIds, locationId],
    )
  }

  async function save(submitAfterSave: boolean) {
    setBusy(submitAfterSave ? 'submit' : 'save')
    setIssues([])
    setNotice(undefined)
    try {
      const saved = await onSave(draft, publication?.id)
      const publicationId = saved.publication?.id ?? publication?.id
      if (submitAfterSave && publicationId) {
        await onSubmit(publicationId)
        setNotice('Submitted for review.')
      } else {
        setNotice('Draft saved.')
      }
    } catch (caught) {
      setIssues(
        caught instanceof BusinessApiError
          ? caught.issues
          : ['Your changes could not be saved. Nothing entered here has been cleared.'],
      )
    } finally {
      setBusy(undefined)
    }
  }

  async function uploadImage(file: File | undefined) {
    if (!file) return
    setIssues([])
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setIssues(['Choose a JPEG, PNG, or WebP image no larger than 8 MB.'])
      return
    }
    setUploading(true)
    try {
      const media = await uploadBusinessImage(file, editor.imageAlt)
      update('imageUrl', media.url)
    } catch (error) {
      setIssues(
        error instanceof BusinessApiError
          ? error.issues
          : ['The image could not be uploaded. Your draft has not been cleared.'],
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="biz-composer-page">
      <header className="biz-page-header">
        <div>
          <button className="biz-back-button" onClick={onCancel} type="button">
            <ArrowLeft size={18} />
            Content
          </button>
          <p className="biz-kicker">{publication ? 'Edit publication' : 'New publication'}</p>
          <h1>{publication ? publication.title : 'Create publication'}</h1>
          <p>Build the business post and check how shoppers will see it.</p>
        </div>
        <div className="biz-header-actions">
          <button
            aria-label="Save draft from header"
            className="biz-secondary-button"
            disabled={Boolean(busy)}
            onClick={() => void save(false)}
            type="button"
          >
            {busy === 'save' ? 'Saving' : 'Save draft'}
          </button>
          <button
            aria-label="Submit publication for review"
            className="biz-primary-button"
            disabled={Boolean(busy)}
            onClick={() => void save(true)}
            type="button"
          >
            {busy === 'submit' ? 'Submitting' : 'Submit for review'}
          </button>
        </div>
      </header>

      <div className="biz-composer-layout">
        <div className="biz-editor-column">
          <section className="biz-editor-section">
            <div className="biz-section-title">
              <span>1</span>
              <div>
                <h2>What are you publishing?</h2>
                <p>The choice sets the shopper card and required details.</p>
              </div>
            </div>
            <div className="biz-kind-grid" role="radiogroup" aria-label="Publication type">
              {publicationKinds.map((kind) => (
                <button
                  aria-checked={editor.kind === kind.id}
                  className={editor.kind === kind.id ? 'is-selected' : ''}
                  key={kind.id}
                  onClick={() => chooseKind(kind.id)}
                  role="radio"
                  type="button"
                >
                  <span>{kind.label}</span>
                  <small>{kind.detail}</small>
                  {editor.kind === kind.id && <CheckCircle size={20} weight="fill" />}
                </button>
              ))}
            </div>
          </section>

          <section className="biz-editor-section">
            <div className="biz-section-title">
              <span>2</span>
              <div>
                <h2>Story and image</h2>
                <p>Lead with the shopper benefit and use a clear product photo.</p>
              </div>
            </div>
            <div className="biz-form-stack">
              <label>
                Title
                <input
                  aria-label="Title"
                  maxLength={120}
                  onChange={(event) => update('title', event.target.value)}
                  placeholder={editor.kind === 'post' ? 'Fresh bread every morning' : 'Weekend potato deal'}
                  value={editor.title}
                />
                <small>{editor.title.length} of 120 characters</small>
              </label>
              <label>
                Description
                <textarea
                  aria-label="Description"
                  maxLength={2000}
                  onChange={(event) => update('bodyText', event.target.value)}
                  placeholder="Tell shoppers what is available and why it is worth a look."
                  rows={5}
                  value={editor.bodyText}
                />
              </label>
              <div className="biz-image-fields">
                <div className="biz-image-drop">
                  {editor.imageUrl ? (
                    <img alt={editor.imageAlt || ''} src={editor.imageUrl} />
                  ) : (
                    <>
                      <ImageSquare size={34} />
                      <strong>Add a cover image</strong>
                      <span>JPEG, PNG, or WebP</span>
                    </>
                  )}
                  <label className="biz-upload-label">
                    <UploadSimple size={16} />
                    Choose image
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      aria-label="Choose image file"
                      disabled={uploading}
                      onChange={(event) => {
                        void uploadImage(event.target.files?.[0])
                        event.target.value = ''
                      }}
                      type="file"
                    />
                  </label>
                  <small>{uploading ? 'Uploading image' : 'Maximum 8 MB'}</small>
                </div>
                <div className="biz-form-stack">
                  <label>
                    Cover image link
                    <input
                      aria-label="Cover image link"
                      inputMode="url"
                      onChange={(event) => update('imageUrl', event.target.value)}
                      placeholder="https://"
                      value={editor.imageUrl}
                    />
                  </label>
                  <label>
                    Image description
                    <input
                      aria-label="Image description"
                      maxLength={240}
                      onChange={(event) => update('imageAlt', event.target.value)}
                      placeholder="A bag of fresh potatoes"
                      value={editor.imageAlt}
                    />
                  </label>
                </div>
              </div>
            </div>
          </section>

          {commercial && (
            <section className="biz-editor-section">
              <div className="biz-section-title">
                <span>3</span>
                <div>
                  <h2>Offer details</h2>
                  <p>Use exact prices and terms so the shopper card stays trustworthy.</p>
                </div>
              </div>
              <div className="biz-form-grid">
                <label>
                  Current price
                  <div className="biz-money-input">
                    <span>{editor.currencyCode}</span>
                    <input
                      aria-label="Current price"
                      inputMode="decimal"
                      min="0"
                      onChange={(event) => update('price', event.target.value)}
                      placeholder="49.99"
                      step="0.01"
                      type="number"
                      value={editor.price}
                    />
                  </div>
                </label>
                <label>
                  Previous price
                  <div className="biz-money-input">
                    <span>{editor.currencyCode}</span>
                    <input
                      aria-label="Previous price"
                      inputMode="decimal"
                      min="0"
                      onChange={(event) => update('previousPrice', event.target.value)}
                      placeholder="69.99"
                      step="0.01"
                      type="number"
                      value={editor.previousPrice}
                    />
                  </div>
                </label>
                {(editor.kind === 'special' || editor.kind === 'promotion') && (
                  <label className="biz-span-two">
                    Offer summary
                    <input
                      aria-label="Offer summary"
                      maxLength={240}
                      onChange={(event) => update('offerText', event.target.value)}
                      placeholder="Buy two and get the third free"
                      value={editor.offerText}
                    />
                  </label>
                )}
                {editor.kind === 'promotion' && (
                  <label>
                    Coupon code
                    <input
                      aria-label="Coupon code"
                      maxLength={80}
                      onChange={(event) => update('couponCode', event.target.value)}
                      placeholder="WEEKEND20"
                      value={editor.couponCode}
                    />
                  </label>
                )}
                <label className={editor.kind === 'promotion' ? '' : 'biz-span-two'}>
                  Destination link
                  <input
                    aria-label="Destination link"
                    inputMode="url"
                    onChange={(event) => update('targetUrl', event.target.value)}
                    placeholder="https://"
                    value={editor.targetUrl}
                  />
                </label>
              </div>
            </section>
          )}

          <section className="biz-editor-section">
            <div className="biz-section-title">
              <span>{commercial ? '4' : '3'}</span>
              <div>
                <h2>Placement and timing</h2>
                <p>Choose the shopper surface, locations, and publication window.</p>
              </div>
            </div>
            <div className="biz-form-stack">
              <fieldset>
                <legend>Where should this appear?</legend>
                <div className="biz-segmented-control">
                  {(['marketplace', 'window', 'both'] as const).map((placement) => (
                    <button
                      className={editor.placement === placement ? 'is-selected' : ''}
                      disabled={editor.kind === 'post' && placement !== 'window'}
                      key={placement}
                      onClick={() => {
                        update('placement', placement)
                        if (placement === 'window') setPreview('window')
                        if (placement === 'marketplace') setPreview('marketplace')
                      }}
                      type="button"
                    >
                      {placement === 'marketplace'
                        ? 'Marketplace'
                        : placement === 'window'
                          ? 'Window Shopping'
                          : 'Both'}
                    </button>
                  ))}
                </div>
              </fieldset>
              {locations.length > 0 && (
                <fieldset>
                  <legend>Locations</legend>
                  <p className="biz-field-hint">No selection means every active location.</p>
                  <div className="biz-checkbox-grid">
                    {locations.filter((location) => location.status === 'active').map((location) => (
                      <label key={location.id}>
                        <input
                          checked={editor.locationIds.includes(location.id)}
                          onChange={() => toggleLocation(location.id)}
                          type="checkbox"
                        />
                        <span>
                          <strong>{location.name}</strong>
                          <small>{location.city}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <div className="biz-form-grid">
                <label>
                  Start date and time
                  <div className="biz-date-input">
                    <CalendarBlank size={18} />
                    <input
                      aria-label="Start date and time"
                      onChange={(event) => update('startsAt', event.target.value)}
                      type="datetime-local"
                      value={editor.startsAt}
                    />
                  </div>
                </label>
                <label>
                  End date and time
                  <div className="biz-date-input">
                    <CalendarBlank size={18} />
                    <input
                      aria-label="End date and time"
                      onChange={(event) => update('endsAt', event.target.value)}
                      required={commercial}
                      type="datetime-local"
                      value={editor.endsAt}
                    />
                  </div>
                </label>
              </div>
            </div>
          </section>

          {issues.length > 0 && <IssueList issues={issues} />}
          {notice && (
            <div className="biz-success-notice" role="status">
              <CheckCircle size={20} weight="fill" />
              {notice}
            </div>
          )}
          <div className="biz-mobile-save-bar">
            <button
              aria-label="Save draft from mobile action bar"
              className="biz-secondary-button"
              disabled={Boolean(busy)}
              onClick={() => void save(false)}
              type="button"
            >
              Save draft
            </button>
            <button
              aria-label="Submit publication from mobile action bar"
              className="biz-primary-button"
              disabled={Boolean(busy)}
              onClick={() => void save(true)}
              type="button"
            >
              Submit
            </button>
          </div>
        </div>

        <aside className="biz-preview-column" aria-label="Consumer preview">
          <div className="biz-preview-sticky">
            <div className="biz-preview-header">
              <div>
                <Eye size={19} />
                <strong>Consumer preview</strong>
              </div>
              <span>Live card</span>
            </div>
            <div className="biz-preview-tabs">
              <button
                className={preview === 'marketplace' ? 'is-active' : ''}
                disabled={editor.kind === 'post' || editor.placement === 'window'}
                onClick={() => setPreview('marketplace')}
                type="button"
              >
                Marketplace preview
              </button>
              <button
                className={preview === 'window' ? 'is-active' : ''}
                disabled={editor.placement === 'marketplace'}
                onClick={() => setPreview('window')}
                type="button"
              >
                Window Shopping preview
              </button>
            </div>
            {preview === 'marketplace'
              ? <MarketplacePreview draft={draft} />
              : <WindowPreview draft={draft} />}
            <div className="biz-preview-note">
              <WarningCircle size={18} />
              <span>Preview uses the same field order shoppers receive after approval.</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}

function MarketplacePreview({ draft }: { draft: PublicationDraft }) {
  return (
    <article className="biz-marketplace-preview">
      <div className="biz-marketplace-image">
        {draft.imageUrl
          ? <img alt={draft.imageAlt ?? ''} src={draft.imageUrl} />
          : <ImageSquare size={42} />}
        <span>{labelForKind(draft.kind)}</span>
      </div>
      <div className="biz-marketplace-copy">
        <p>Fresh Market</p>
        <h3>{draft.title || 'Your publication title'}</h3>
        <p>{draft.bodyText || 'Your description will appear here.'}</p>
        {draft.priceCents && (
          <div className="biz-preview-price">
            <strong>{formatMoney(draft.priceCents, draft.currencyCode)}</strong>
            {draft.previousPriceCents && <s>{formatMoney(draft.previousPriceCents, draft.currencyCode)}</s>}
          </div>
        )}
        <button type="button">
          View offer
          <ArrowLeft size={15} className="biz-rotate-arrow" />
        </button>
      </div>
    </article>
  )
}

function WindowPreview({ draft }: { draft: PublicationDraft }) {
  return (
    <article className="biz-window-preview">
      <div className="biz-window-image">
        {draft.imageUrl
          ? <img alt={draft.imageAlt ?? ''} src={draft.imageUrl} />
          : <Storefront size={74} weight="duotone" />}
      </div>
      <div className="biz-window-scrim" />
      <div className="biz-window-copy">
        <span>Business post</span>
        <p>Fresh Market</p>
        <h3>{draft.title || 'Your Window Shopping title'}</h3>
        <p>{draft.bodyText || 'Your story will appear over the cover image.'}</p>
        {draft.priceCents && <strong>{formatMoney(draft.priceCents, draft.currencyCode)}</strong>}
        <div className="biz-window-actions">
          <span>♡ Save</span>
          <span>Open ↗</span>
        </div>
      </div>
    </article>
  )
}

function stateFromPublication(publication?: BusinessPublication): EditorState {
  return {
    bodyText: publication?.bodyText ?? '',
    couponCode: publication?.couponCode ?? '',
    currencyCode: publication?.currencyCode ?? 'ZAR',
    endsAt: toLocalDateTime(publication?.endsAt),
    imageAlt: publication?.imageAlt ?? '',
    imageUrl: publication?.imageUrl ?? '',
    kind: publication?.kind ?? 'deal',
    locationIds: publication?.locationIds ?? [],
    offerText: publication?.offerText ?? '',
    placement: publication?.placement ?? 'both',
    previousPrice: centsToInput(publication?.previousPriceCents),
    price: centsToInput(publication?.priceCents),
    startsAt: toLocalDateTime(publication?.startsAt),
    targetUrl: publication?.targetUrl ?? '',
    title: publication?.title ?? '',
  }
}

function draftFromEditor(editor: EditorState): PublicationDraft {
  return {
    bodyText: editor.bodyText.trim(),
    couponCode: editor.couponCode.trim() || undefined,
    currencyCode: editor.price ? editor.currencyCode : undefined,
    endsAt: editor.endsAt || undefined,
    imageAlt: editor.imageAlt.trim() || undefined,
    imageUrl: editor.imageUrl.trim() || undefined,
    kind: editor.kind,
    locationIds: editor.locationIds,
    offerText: editor.offerText.trim() || undefined,
    placement: editor.placement,
    previousPriceCents: moneyToCents(editor.previousPrice),
    priceCents: moneyToCents(editor.price),
    startsAt: editor.startsAt || undefined,
    targetUrl: editor.targetUrl.trim() || undefined,
    title: editor.title.trim(),
  }
}

function moneyToCents(value: string): number | undefined {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined
}

function centsToInput(value: number | undefined): string {
  return value ? (value / 100).toFixed(2) : ''
}

function toLocalDateTime(value: string | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function formatMoney(cents: number, currencyCode = 'ZAR'): string {
  return new Intl.NumberFormat('en-ZA', {
    currency: currencyCode,
    style: 'currency',
  }).format(cents / 100)
}

function labelForKind(kind: PublicationKind): string {
  return {
    deal: 'Deal',
    post: 'Business post',
    promotion: 'Promotion',
    special: 'Special',
  }[kind]
}
