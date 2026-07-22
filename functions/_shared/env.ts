export interface TrolleyScoutEnv {
  AI?: Ai
  DB?: D1Database
  EMAIL_ENCRYPTION_KEY?: string
  APP_URL?: string
  GEOAPIFY_API_KEY?: string
  // Optional: a free r.jina.ai key makes the search-proxy fallback reliable;
  // without it the keyless tier applies and scouts retry hourly.
  JINA_API_KEY?: string
  PAYFAST_MERCHANT_ID?: string
  PAYFAST_MERCHANT_KEY?: string
  PAYFAST_MODE?: 'sandbox' | 'live'
  // Host-only override for PayFast notifications. The path is always chosen by
  // purpose — see payfastNotifyUrl.ts. Leave unset to notify our own origin,
  // which is what every deployment wants unless a gateway sits in front.
  PAYFAST_NOTIFY_ORIGIN?: string
  PAYFAST_PASSPHRASE?: string
  SCOUT_DEBUG?: string
}

export type TrolleyScoutD1Env = TrolleyScoutEnv & { DB: D1Database }

export function hasTrolleyScoutDatabase(env: TrolleyScoutEnv): env is TrolleyScoutD1Env {
  return Boolean(env.DB)
}
