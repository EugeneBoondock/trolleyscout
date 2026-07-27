export interface TrolleyScoutEnv {
  AI?: Ai
  DB?: D1Database
  MEDIA?: R2Bucket
  ORGANIZATION_EMAIL?: Fetcher
  EMAIL_ENCRYPTION_KEY?: string
  APP_URL?: string
  // Cloudflare's own traffic numbers for the admin analytics tab. The token
  // needs the "Analytics:Read" zone permission and nothing else. Without both
  // of these the tab still works — it just shows in-app numbers only.
  CLOUDFLARE_ANALYTICS_TOKEN?: string
  CLOUDFLARE_ZONE_ID?: string
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
  OPENAI_API_KEY?: string
}

export type TrolleyScoutD1Env = TrolleyScoutEnv & { DB: D1Database }

export function hasTrolleyScoutDatabase(env: TrolleyScoutEnv): env is TrolleyScoutD1Env {
  return Boolean(env.DB)
}
