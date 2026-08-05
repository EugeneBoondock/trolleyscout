import type { TrolleyScoutEnv } from './env'

export const DEEPSEEK_FALLBACK_MODEL =
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'

export interface DeepSeekFallbackRequest {
  jsonSchema?: Record<string, unknown>
  maxTokens: number
  messages: Array<{
    content: string
    role: 'assistant' | 'system' | 'user'
  }>
}

/**
 * Runs the Cloudflare-hosted DeepSeek model. The AI binding keeps provider
 * credentials out of the browser and Android app.
 */
export async function runDeepSeekFallback(
  env: TrolleyScoutEnv,
  request: DeepSeekFallbackRequest,
): Promise<string> {
  if (!env.AI) {
    throw new TypeError('DeepSeek fallback is not configured.')
  }

  const result = await env.AI.run(
    DEEPSEEK_FALLBACK_MODEL,
    {
      max_tokens: request.maxTokens,
      messages: request.messages,
      temperature: 0.1,
      ...(request.jsonSchema
        ? {
            response_format: {
              json_schema: request.jsonSchema,
              type: 'json_schema',
            },
          }
        : {}),
    } as never,
  )

  return extractDeepSeekText(result)
}

export async function isOpenAICreditExhausted(
  response: Response,
): Promise<boolean> {
  if (response.status !== 402 && response.status !== 429) return false
  if (response.status === 402) return true

  let errorText = ''
  try {
    errorText = JSON.stringify(await response.clone().json()).toLowerCase()
  } catch {
    return false
  }

  return [
    'billing_hard_limit',
    'credit balance',
    'credit_balance',
    'insufficient credits',
    'insufficient_credits',
    'insufficient quota',
    'insufficient_quota',
    'quota exceeded',
  ].some((marker) => errorText.includes(marker))
}

export function openAITextPayload(text: string): Record<string, unknown> {
  return {
    output: [
      {
        content: [{ text, type: 'output_text' }],
        type: 'message',
      },
    ],
  }
}

function extractDeepSeekText(value: unknown): string {
  if (!value || typeof value !== 'object') {
    throw new TypeError('DeepSeek returned an invalid response.')
  }
  const row = value as Record<string, unknown>
  if (typeof row.response === 'string' && row.response.trim()) {
    return row.response.trim()
  }

  const choices = Array.isArray(row.choices) ? row.choices : []
  const first = choices[0]
  if (first && typeof first === 'object') {
    const message = (first as Record<string, unknown>).message
    if (message && typeof message === 'object') {
      const content = (message as Record<string, unknown>).content
      if (typeof content === 'string' && content.trim()) return content.trim()
    }
  }

  throw new TypeError('DeepSeek returned no answer.')
}
