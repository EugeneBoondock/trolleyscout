import { useState } from 'react'
import { Lifebuoy, PaperPlaneTilt } from '@phosphor-icons/react'
import { submitSupportMessage } from '../services/apiClient'

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
}

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function SupportView({ defaultName, defaultEmail }: SupportViewProps) {
  const [name, setName] = useState(defaultName ?? '')
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [topic, setTopic] = useState<SupportTopic>(SUPPORT_TOPICS[0])
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

      {status === 'sent' ? (
        <section className="support-sent" aria-live="polite">
          <Lifebuoy size={30} weight="duotone" />
          <div>
            <h2>Thanks — we’ve got it</h2>
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
