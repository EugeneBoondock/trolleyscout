import { useEffect, useRef, useState } from 'react'
import { ChatCircleDots, Lifebuoy, PaperPlaneTilt } from '@phosphor-icons/react'
import clsx from 'clsx'
import { sendSupportChat, submitSupportMessage } from '../services/apiClient'
import type { SupportChatTurn } from '../types'

// The topics a shopper can raise, kept in one list so the form stays in sync.
const SUPPORT_TOPICS = [
  'Deal or price problem',
  'Account & login',
  'Billing & subscription',
  'Report a bug',
  'Suggest a store',
  'Something else',
] as const

type SupportTopic = (typeof SUPPORT_TOPICS)[number]

interface SupportViewProps {
  // Prefilled for signed-in members so they do not retype what we already know.
  defaultName?: string
  defaultEmail?: string
  // The live chat files against an account, so it only appears once signed in.
  isSignedIn?: boolean
}

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function SupportView({ defaultName, defaultEmail, isSignedIn }: SupportViewProps) {
  const [name, setName] = useState(defaultName ?? '')
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [topic, setTopic] = useState<SupportTopic>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('topic') === 'account'
      ? 'Account & login'
      : SUPPORT_TOPICS[0],
  )
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [notice, setNotice] = useState<string | undefined>()

  async function send() {
    if (status === 'sending') return

    setStatus('sending')
    setNotice(undefined)

    const result = await submitSupportMessage({
      email: email.trim(),
      message: message.trim(),
      name: name.trim(),
      topic,
    })

    if (result.ok) {
      setStatus('sent')
      setNotice(result.message)
      setMessage('')
    } else {
      setStatus('error')
      setNotice(result.message)
    }
  }

  return (
    <div className="support-view">
      <section className="member-section-head">
        <div>
          <p className="eyebrow">Support</p>
          <h1>Get help</h1>
          <p className="section-lede">
            Spotted a wrong price, stuck on billing, or want a store added? Send us a message and
            it lands straight with the team. Include as much detail as you can.
          </p>
        </div>
      </section>

      {isSignedIn && <SupportChat />}

      {status === 'sent' ? (
        <section className="support-sent" aria-live="polite">
          <Lifebuoy size={30} weight="duotone" />
          <div>
            <h2>Thanks, we’ve got it</h2>
            <p>{notice ?? 'Your message has reached the team. We’ll get back to you by email.'}</p>
            <button
              className="ghost-button"
              onClick={() => {
                setStatus('idle')
                setNotice(undefined)
              }}
              type="button"
            >
              Send another message
            </button>
          </div>
        </section>
      ) : (
        <form
          className="account-form support-form"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <label className="field">
            Your name
            <input
              autoComplete="name"
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label className="field">
            Email for our reply
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="field">
            Topic
            <select onChange={(event) => setTopic(event.target.value as SupportTopic)} value={topic}>
              {SUPPORT_TOPICS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            How can we help?
            <textarea
              maxLength={4000}
              minLength={10}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell us what happened, which store or deal, and what you expected."
              required
              rows={6}
              value={message}
            />
          </label>
          <button className="primary-button" disabled={status === 'sending'} type="submit">
            <PaperPlaneTilt size={18} weight="fill" />
            {status === 'sending' ? 'Sending' : 'Send message'}
          </button>
          {status === 'error' && notice && (
            <p className="account-notice" role="alert">
              {notice}
            </p>
          )}
        </form>
      )}
    </div>
  )
}

interface ChatLine {
  id: string
  role: 'you' | 'scout'
  text: string
}

/// The live help chat. It talks the problem through, then hands the admin a
/// written brief. The form below stays exactly where it is — the chat is the
/// quick path, never the only one.
function SupportChat() {
  const [lines, setLines] = useState<ChatLine[]>([
    {
      id: 'greeting',
      role: 'scout',
      text:
        'Hi — tell me what went wrong, or what you wish Trolley Scout did. ' +
        'I will ask a question or two, then pass it to the team with a summary.',
    },
  ])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [filedNotice, setFiledNotice] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const streamRef = useRef<HTMLDivElement>(null)
  const lineCounter = useRef(0)

  useEffect(() => {
    streamRef.current?.scrollTo({ behavior: 'smooth', top: streamRef.current.scrollHeight })
  }, [lines, filedNotice])

  function nextId(): string {
    lineCounter.current += 1
    return `line-${lineCounter.current}`
  }

  async function send() {
    const message = draft.trim()
    if (!message || isSending) return

    // The history sent to the server is what the model has already seen, so it
    // is built before this turn is appended.
    const history: SupportChatTurn[] = lines
      .filter((line) => line.id !== 'greeting')
      .map((line) => ({ role: line.role === 'you' ? 'user' : 'assistant', text: line.text }))

    setLines((current) => [...current, { id: nextId(), role: 'you', text: message }])
    setDraft('')
    setIsSending(true)
    setError(undefined)

    const result = await sendSupportChat(message, history)
    setIsSending(false)

    if (!result.ok || !result.answer) {
      setError(result.message)
      return
    }

    setLines((current) => [...current, { id: nextId(), role: 'scout', text: result.answer!.reply }])

    if (result.answer.filed) {
      const filed = result.answer.filed
      setFiledNotice(
        `Sent to the team as “${filed.topic}” (${filed.category}, ${filed.severity} priority). ` +
          'You will get a reply by email.',
      )
    }
  }

  return (
    <section className="support-chat" aria-label="Live help chat">
      <header className="support-chat-head">
        <ChatCircleDots size={22} weight="duotone" />
        <div>
          <strong>Talk it through</strong>
          <span>The chat writes up your report and files it for the team.</span>
        </div>
      </header>

      <div className="support-chat-stream" ref={streamRef} role="log" aria-live="polite">
        {lines.map((line) => (
          <p className={clsx('support-chat-line', `is-${line.role}`)} key={line.id}>
            {line.text}
          </p>
        ))}
        {isSending && <p className="support-chat-line is-scout is-thinking">Thinking…</p>}
        {filedNotice && (
          <p className="support-chat-filed" role="status">
            {filedNotice}
          </p>
        )}
      </div>

      {error && (
        <p className="account-notice" role="alert">
          {error}
        </p>
      )}

      <form
        className="support-chat-composer"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <label className="sr-only" htmlFor="support-chat-input">
          Your message
        </label>
        <input
          disabled={isSending}
          id="support-chat-input"
          maxLength={1200}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="What happened, or what would you change?"
          value={draft}
        />
        <button className="primary-button" disabled={isSending || !draft.trim()} type="submit">
          <PaperPlaneTilt size={16} weight="fill" />
          Send
        </button>
      </form>
    </section>
  )
}
