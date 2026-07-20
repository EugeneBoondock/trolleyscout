import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import { createSupportMessage } from '../_shared/supportStore'

// Public endpoint: anyone can raise a support message from the Support page,
// signed in or not. Admins read them in the admin console (see api/admin.ts).

interface SupportBody {
  name?: string
  email?: string
  topic?: string
  message?: string
}

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'POST')
  }

  let body: SupportBody
  try {
    body = (await request.json()) as SupportBody
  } catch {
    return json({ message: 'Request body must be valid JSON.' }, { headers: privateHeaders, status: 400 })
  }

  // If the sender happens to be signed in, link the message to their account so
  // an admin can see who it came from. Signed-out visitors are still accepted.
  const session = await getMemberSession(env, request)

  const result = await createSupportMessage(env, {
    accountId: session.account?.id,
    email: body.email ?? '',
    message: body.message ?? '',
    name: body.name ?? '',
    topic: body.topic ?? '',
  })

  if ('issues' in result) {
    return json({ message: result.issues[0] }, { headers: privateHeaders, status: 400 })
  }

  return json(
    { id: result.id, message: 'Thanks — your message has reached the team. We’ll reply by email.' },
    { headers: privateHeaders, status: 201 },
  )
}
