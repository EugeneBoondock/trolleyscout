import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowSquareOut,
  BookOpenText,
  PaperPlaneTilt,
  Sparkle,
} from '@phosphor-icons/react'

import { LeafletViewer } from '../components/LeafletViewer'
import { ScoutMark } from '../components/ScoutMark'
import { sendScoutChatMessage } from '../services/scoutChatClient'
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

const starterPrompts = [
  'Find the best grocery savings',
  'Show useful catalogues',
  'Find deals within my budget',
]

const welcomeMessage: ConversationMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Hi, I’m Mr Scout. Tell me what you need, your budget, or the store you prefer.',
}

export function ScoutChatView({
  sendMessage = sendScoutChatMessage,
}: {
  sendMessage?: (
    message: string,
    history: ScoutChatTurn[],
    signal?: AbortSignal,
  ) => Promise<ScoutChatAnswer>
}) {
  const [messages, setMessages] = useState<ConversationMessage[]>([welcomeMessage])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
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
        <span className="scout-chat-status">
          <Sparkle aria-hidden="true" size={16} weight="fill" />
          Ready to scout
        </span>
      </header>

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
                            <a
                              href={withReferralSource(deal.productUrl)}
                              rel="noreferrer"
                              target="_blank"
                              aria-label={`View ${deal.title}`}
                            >
                              {deal.soldOut ? 'Check product' : 'View deal'}
                              <ArrowSquareOut aria-hidden="true" size={16} />
                            </a>
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
          {starterPrompts.map((prompt) => (
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
