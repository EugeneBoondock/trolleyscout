import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowSquareOut,
  BookOpenText,
  Check,
  PaperPlaneTilt,
  Plus,
  ShoppingCartSimple,
  Sparkle,
  ThumbsDown,
  ThumbsUp,
} from '@phosphor-icons/react'

import { useScoutCart, type UseScoutCart } from '../hooks/useScoutCart'
import { isInCart } from '../services/scoutCart'
import { LeafletViewer } from '../components/LeafletViewer'
import { ScoutMark } from '../components/ScoutMark'
import { rateScoutAnswer, sendScoutChatMessage } from '../services/scoutChatClient'
import { withReferralSource } from '../services/outboundLink'
import type {
  ScoutChatAnswer,
  ScoutChatCatalogueCard,
  ScoutChatTurn,
  StoreLeaflet,
} from '../types'

interface ConversationMessage {
  answer?: ScoutChatAnswer
  id: string
  role: 'assistant' | 'user'
  text: string
}

/**
 * What an empty chat offers. Written as things a shopper here would really
 * ask, so the first message is a real question rather than a demo of the
 * feature.
 */
const starterPromptsByCountry: Record<string, readonly string[]> = {
  ZA: [
    'Cheapest 2L full cream milk near me',
    'What do I need for chakalaka, and what does it cost?',
    'Compare maize meal prices at Shoprite, Boxer and Checkers',
    '55 inch smart TV under R8000',
  ],
}

const defaultStarterPrompts = [
  'Find the best grocery savings',
  'Show useful catalogues',
  'Find deals within my budget',
  'Compare prices across my usual stores',
]

function starterPromptsFor(countryCode: string): readonly string[] {
  return starterPromptsByCountry[countryCode.toUpperCase()] ?? defaultStarterPrompts
}

const welcomeMessage: ConversationMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Hi, Iâ€™m Mr Scout. Tell me what you need, your budget, or the store you prefer.',
}

export function ScoutChatView({
  countryCode = 'ZA',
  rateAnswer = rateScoutAnswer,
  sendMessage = sendScoutChatMessage,
}: {
  countryCode?: string
  rateAnswer?: (retrievalId: string, feedback: 'down' | 'up') => Promise<boolean>
  sendMessage?: (
    message: string,
    history: ScoutChatTurn[],
    signal?: AbortSignal,
  ) => Promise<ScoutChatAnswer>
}) {
  const [messages, setMessages] = useState<ConversationMessage[]>([welcomeMessage])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [cartFeedback, setCartFeedback] = useState('')
  const [ratedAnswers, setRatedAnswers] = useState<Record<string, 'down' | 'up'>>({})
  const cart = useScoutCart()
  const [openCatalogue, setOpenCatalogue] = useState<ScoutChatCatalogueCard>()
  const endRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef<AbortController | undefined>(undefined)
  const messageNumber = useRef(0)

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [isSending, messages.length])

  useEffect(() => () => requestRef.current?.abort(), [])

  const history = useMemo<ScoutChatTurn[]>(
    () => messages
      .filter((message) => message.id !== welcomeMessage.id)
      .map((message) => ({ role: message.role, text: message.text }))
      .slice(-8),
    [messages],
  )

  async function askMrScout(value: string) {
    const message = value.trim()
    if (!message || isSending) return

    const id = ++messageNumber.current
    setDraft('')
    setIsSending(true)
    setMessages((current) => [...current, {
      id: `user-${id}`,
      role: 'user',
      text: message,
    }])

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    try {
      const answer = await sendMessage(message, history, controller.signal)
      setMessages((current) => [...current, {
        answer,
        id: `assistant-${id}`,
        role: 'assistant',
        text: answer.reply,
      }])
    } catch (error) {
      if (controller.signal.aborted) return
      setMessages((current) => [...current, {
        id: `assistant-error-${id}`,
        role: 'assistant',
        text: error instanceof Error
          ? error.message
          : 'Mr Scout could not answer right now.',
      }])
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = undefined
        setIsSending(false)
      }
    }
  }

  function rate(retrievalId: string, feedback: 'down' | 'up') {
    // Recorded optimistically — a shopper should never wait to be thanked.
    setRatedAnswers((current) => ({ ...current, [retrievalId]: feedback }))
    void rateAnswer(retrievalId, feedback)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void askMrScout(draft)
  }

  return (
    <section className="scout-chat" aria-labelledby="mr-scout-heading">
      <header className="scout-chat-header">
        <div className="scout-chat-identity">
          <span className="scout-chat-avatar">
            <ScoutMark motion="scout" size={54} />
          </span>
          <div>
            <p className="eyebrow">Shopping assistant</p>
            <h1 id="mr-scout-heading">Mr Scout</h1>
            <p>Verified deals, catalogue pages, prices, and store links.</p>
          </div>
        </div>
        <div className="scout-chat-header-actions">
          <span className="scout-chat-status">
            <Sparkle aria-hidden="true" size={16} weight="fill" />
            Ready to scout
          </span>
          <button
            aria-expanded={isCartOpen}
            aria-label={`Mr Scout cart, ${cart.summary.itemCount} ${
              cart.summary.itemCount === 1 ? 'item' : 'items'
            }`}
            className="scout-chat-cart-button"
            onClick={() => setIsCartOpen((open) => !open)}
            type="button"
          >
            <ShoppingCartSimple aria-hidden="true" size={20} />
            {cart.summary.itemCount > 0 && (
              <span className="scout-chat-cart-badge">{cart.summary.itemCount}</span>
            )}
          </button>
        </div>
      </header>

      {isCartOpen && (
        <ScoutCartPanel
          cart={cart}
          onClose={() => setIsCartOpen(false)}
          onFeedback={setCartFeedback}
          feedback={cartFeedback}
        />
      )}

      <div className="scout-chat-thread" aria-live="polite">
        {messages.map((message) => (
          <article
            className={`scout-chat-message is-${message.role}`}
            key={message.id}
          >
            {message.role === 'assistant' && (
              <span className="scout-chat-message-mark">
                <ScoutMark motion="static" size={30} />
              </span>
            )}
            <div className="scout-chat-bubble">
              <p>{message.text}</p>
              {message.answer && (
                <>
                  {message.answer.deals.length > 0 && (
                    <div className="scout-chat-card-row" aria-label="Recommended deals">
                      {message.answer.deals.map((deal) => (
                        <article className="scout-chat-deal-card" key={deal.id}>
                          {deal.imageUrl && (
                            <img
                              alt={deal.title}
                              loading="lazy"
                              onError={(event) => { event.currentTarget.hidden = true }}
                              src={deal.imageUrl}
                            />
                          )}
                          <div>
                            <small>{deal.retailerName}</small>
                            <strong>{deal.title}</strong>
                            {deal.soldOut && (
                              <span className="scout-chat-sold-out">Sold out</span>
                            )}
                            <p className="scout-chat-price">
                              <b>{deal.priceText}</b>
                              {deal.previousPriceText && <s>{deal.previousPriceText}</s>}
                            </p>
                            {deal.savingText && <span>{deal.savingText}</span>}
                            <div className="scout-chat-card-actions">
                              <a
                                href={withReferralSource(deal.productUrl)}
                                rel="noreferrer"
                                target="_blank"
                                aria-label={`View ${deal.title}`}
                              >
                                {deal.soldOut ? 'Check product' : 'View deal'}
                                <ArrowSquareOut aria-hidden="true" size={16} />
                              </a>
                              <button
                                aria-label={isInCart(cart.items, deal.productUrl)
                                  ? `Remove ${deal.title} from your Mr Scout cart`
                                  : `Add ${deal.title} to your Mr Scout cart`}
                                className="scout-chat-add-to-cart"
                                onClick={() => (isInCart(cart.items, deal.productUrl)
                                  ? cart.remove(deal.productUrl)
                                  : cart.add(deal))}
                                type="button"
                              >
                                {isInCart(cart.items, deal.productUrl)
                                  ? <><Check aria-hidden="true" size={16} />In cart</>
                                  : <><Plus aria-hidden="true" size={16} />Add to cart</>}
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}

                  {message.answer.catalogues.length > 0 && (
                    <div className="scout-chat-card-row" aria-label="Recommended catalogues">
                      {message.answer.catalogues.map((catalogue) => (
                        <button
                          aria-label={`Read ${catalogue.name}`}
                          className="scout-chat-catalogue-card"
                          key={catalogue.id}
                          onClick={() => setOpenCatalogue(catalogue)}
                          type="button"
                        >
                          {catalogue.imageUrl ? (
                            <img alt="" loading="lazy" src={catalogue.imageUrl} />
                          ) : (
                            <BookOpenText aria-hidden="true" size={34} />
                          )}
                          <span>
                            <small>{catalogue.retailerName}</small>
                            <strong>{catalogue.name}</strong>
                            <em>
                              {cataloguePageLabel(catalogue.pageCount)}
                            </em>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {message.answer.retrievalId && (
                    <div className="scout-chat-rating">
                      {ratedAnswers[message.answer.retrievalId] ? (
                        <span>Thanks — that helps Mr Scout get better.</span>
                      ) : (
                        <>
                          <span>Was this helpful?</span>
                          <button
                            aria-label="This answer was helpful"
                            onClick={() => rate(message.answer!.retrievalId!, 'up')}
                            type="button"
                          >
                            <ThumbsUp aria-hidden="true" size={16} />
                          </button>
                          <button
                            aria-label="This answer was not helpful"
                            onClick={() => rate(message.answer!.retrievalId!, 'down')}
                            type="button"
                          >
                            <ThumbsDown aria-hidden="true" size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {message.answer.followUps.length > 0 && (
                    <div className="scout-chat-followups" aria-label="Suggested follow-up messages">
                      {message.answer.followUps.map((followUp) => (
                        <button
                          disabled={isSending}
                          key={followUp}
                          onClick={() => void askMrScout(followUp)}
                          type="button"
                        >
                          {followUp}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </article>
        ))}

        {isSending && (
          <div className="scout-chat-thinking" role="status">
            <ScoutMark motion="scout" size={30} />
            <span>Mr Scout is checking live offers</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length === 1 && (
        <div className="scout-chat-starters" aria-label="Try asking">
          {starterPromptsFor(countryCode).map((prompt) => (
            <button
              disabled={isSending}
              key={prompt}
              onClick={() => void askMrScout(prompt)}
              type="button"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <form className="scout-chat-composer" onSubmit={handleSubmit}>
        <label htmlFor="mr-scout-message">Message Mr Scout</label>
        <div>
          <textarea
            disabled={isSending}
            id="mr-scout-message"
            maxLength={600}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void askMrScout(draft)
              }
            }}
            placeholder="Ask for a product, budget, store, or catalogue"
            rows={2}
            value={draft}
          />
          <button
            aria-label="Send message"
            disabled={isSending || !draft.trim()}
            type="submit"
          >
            <PaperPlaneTilt aria-hidden="true" size={21} weight="fill" />
          </button>
        </div>
        <small>Prices and availability can change. Open the store link to confirm.</small>
      </form>

      {openCatalogue && (
        <LeafletViewer
          leaflet={catalogueCardToLeaflet(openCatalogue)}
          onClose={() => setOpenCatalogue(undefined)}
        />
      )}
    </section>
  )
}

/**
 * The consideration list a shopper builds while talking to Mr Scout. Totals
 * are broken down per store because "everything from Takealot" and
 * "everything from Game" are two different trips.
 */
function ScoutCartPanel({
  cart,
  feedback,
  onClose,
  onFeedback,
}: {
  cart: UseScoutCart
  feedback: string
  onClose: () => void
  onFeedback: (message: string) => void
}) {
  async function move(retailerName?: string) {
    const { failed, moved } = await cart.moveToBasket(retailerName)
    if (moved === 0) {
      onFeedback('Nothing could be moved to your basket. Try again shortly.')
      return
    }
    onFeedback(
      failed > 0
        ? `Moved ${moved} to your basket. ${failed} could not be moved and are still here.`
        : `Moved ${moved} ${moved === 1 ? 'item' : 'items'} to your basket.`,
    )
  }

  return (
    <section aria-label="Mr Scout cart" className="scout-chat-cart-panel">
      <header>
        <h2>Your Mr Scout cart</h2>
        <button aria-label="Close cart" onClick={onClose} type="button">Close</button>
      </header>

      {cart.items.length === 0 ? (
        <p className="scout-chat-cart-empty">
          Nothing here yet. Add anything Mr Scout finds and it will wait for you.
        </p>
      ) : (
        <>
          {cart.summary.groups.map((group) => (
            <div className="scout-chat-cart-group" key={group.retailerName}>
              <h3>
                {group.retailerName}
                <span>
                  {group.totalCents === undefined
                    ? `${group.itemCount} ${group.itemCount === 1 ? 'item' : 'items'}`
                    : formatRands(group.totalCents)}
                </span>
              </h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item.productUrl}>
                    <a href={withReferralSource(item.productUrl)} rel="noreferrer" target="_blank">
                      {item.title}
                    </a>
                    <b>{item.priceText}</b>
                    <button
                      aria-label={`Remove ${item.title} from your Mr Scout cart`}
                      onClick={() => cart.remove(item.productUrl)}
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <button
                disabled={cart.isMoving}
                onClick={() => void move(group.retailerName)}
                type="button"
              >
                Add {group.retailerName} items to basket
              </button>
            </div>
          ))}

          <p className="scout-chat-cart-total">
            <span>{cart.summary.itemCount} items</span>
            <b>{formatRands(cart.summary.totalCents)}</b>
            {cart.summary.unpricedCount > 0 && (
              <small>{cart.summary.unpricedCount} without a readable price</small>
            )}
          </p>

          <div className="scout-chat-cart-actions">
            <button
              className="primary-button"
              disabled={cart.isMoving}
              onClick={() => void move()}
              type="button"
            >
              {cart.isMoving ? 'Movingâ€¦' : 'Add all to basket'}
            </button>
            <button
              className="ghost-button"
              disabled={cart.isMoving}
              onClick={cart.clear}
              type="button"
            >
              Clear
            </button>
          </div>
        </>
      )}

      {feedback && <p aria-live="polite" className="scout-chat-cart-feedback">{feedback}</p>}
    </section>
  )
}

function formatRands(cents: number): string {
  return `R${(cents / 100).toFixed(2)}`
}

function catalogueCardToLeaflet(catalogue: ScoutChatCatalogueCard): StoreLeaflet {
  return {
    capturedAt: new Date().toISOString(),
    documentUrl: catalogue.url,
    id: catalogue.id,
    imageUrl: catalogue.imageUrl,
    name: catalogue.name,
    pages: catalogue.pageImageUrls.map((imageUrl, index) => ({
      height: 0,
      imageUrl,
      pageNumber: index + 1,
      width: 0,
    })),
    pagesUrl: catalogue.pagesUrl,
    retailerId: catalogue.retailerName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    retailerName: catalogue.retailerName,
    url: catalogue.url,
    validTo: catalogue.validTo,
  }
}

function cataloguePageLabel(pageCount: number): string {
  if (pageCount <= 0) return 'Open catalogue'
  return pageCount === 1 ? '1 page' : `${pageCount} pages`
}


