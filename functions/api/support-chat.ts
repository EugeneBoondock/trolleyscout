import { getMemberSession } from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import { createSupportMessage } from '../_shared/supportStore'
import {
  SUPPORT_CHAT_SYSTEM_PROMPT,
  formatAdminBrief,
  normalizeSupportChatRequest,
  parseSupportChatAnswer,
  supportChatAnswerSchema,
} from '../_shared/supportChat'
import type { TrolleyScoutEnv } from '../_shared/env'

const MODEL = 'gpt-5.4-mini'
const privateHeaders = { 'cache-control': 'private, no-store' }

// The help chat behind About & help. Signed-in only: the message is filed
// against the member's own account and answered by email, so there is no
// anonymous path here — signed-out visitors still have the support form.
export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'POST')
  }

  const session = await getMemberSession(env, request)
  if (!session.account) {
    return json(
      { message: 'Sign in to use the help chat.' },
      { headers: privateHeaders, status: 401 },
    )
  }

  if (!env.OPENAI_API_KEY) {
    return json(
      { message: 'The help chat is not configured yet. Use the form below and we will still get it.' },
      { headers: privateHeaders, status: 503 },
    )
  }

  let input: ReturnType<typeof normalizeSupportChatRequest>
  try {
    input = normalizeSupportChatRequest(await request.json())
  } catch (error) {
    return json(
      { message: error instanceof Error ? error.message : 'Chat input is invalid.' },
      { headers: privateHeaders, status: 422 },
    )
  }

  const modelRequest = new Request('https://api.openai.com/v1/responses', {
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: 'low' },
      max_output_tokens: 900,
      store: false,
      input: [
        { role: 'developer', content: SUPPORT_CHAT_SYSTEM_PROMPT },
        {
          role: 'developer',
          content:
            `The shopper is signed in as ${session.account.displayName} on the ` +
            `${session.account.planName} plan in ${session.account.countryName}. ` +
            'Do not ask them for their name or email — we already have both.',
        },
        ...input.history.map((turn) => ({ role: turn.role, content: turn.text })),
        { role: 'user', content: input.message },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'support_chat_answer',
          strict: false,
          schema: supportChatAnswerSchema,
        },
      },
    }),
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
  })

  let response: Response
  try {
    response = await fetch(modelRequest)
  } catch {
    return json(
      { message: 'The help chat could not connect. Try again, or use the form below.' },
      { headers: privateHeaders, status: 502 },
    )
  }

  if (!response.ok) {
    return json(
      {
        message:
          response.status === 429
            ? 'The help chat is busy. Try again in a moment.'
            : 'The help chat could not answer. Use the form below and we will still get it.',
      },
      { headers: privateHeaders, status: response.status === 429 ? 429 : 502 },
    )
  }

  let answer: ReturnType<typeof parseSupportChatAnswer>
  try {
    answer = parseSupportChatAnswer(await response.json())
  } catch {
    return json(
      { message: 'The help chat returned an unreadable answer. Try again.' },
      { headers: privateHeaders, status: 502 },
    )
  }

  if (!answer.file || !answer.brief) {
    return json({ answer: { reply: answer.reply } }, { headers: privateHeaders })
  }

  // The account decides who this is from — never the chat turns. The brief and
  // the member's own words are stored together, with the words as the message.
  const brief = answer.brief
  const filed = await createSupportMessage(env, {
    accountId: session.account.id,
    aiBrief: formatAdminBrief(brief),
    category: brief.category,
    channel: 'chat',
    email: session.account.email,
    message: brief.memberWords,
    name: session.account.displayName,
    severity: brief.severity,
    topic: brief.topic,
  })

  if ('issues' in filed) {
    return json(
      {
        answer: {
          reply: `${answer.reply}\n\n(I could not file that: ${filed.issues[0]})`,
        },
      },
      { headers: privateHeaders },
    )
  }

  return json(
    {
      answer: {
        reply: answer.reply,
        filed: {
          category: brief.category,
          severity: brief.severity,
          summary: brief.summary,
          topic: brief.topic,
        },
      },
    },
    { headers: privateHeaders },
  )
}
