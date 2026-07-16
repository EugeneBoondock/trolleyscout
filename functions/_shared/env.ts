export interface TrolleyScoutEnv {
  AI?: Ai
  DB?: D1Database
  APP_URL?: string
  GEOAPIFY_API_KEY?: string
  // Optional: a free r.jina.ai key makes the search-proxy fallback reliable;
  // without it the keyless tier applies and scouts retry hourly.
  JINA_API_KEY?: string
  PAYFAST_MERCHANT_ID?: string
  PAYFAST_MERCHANT_KEY?: string
  PAYFAST_MODE?: 'sandbox' | 'live'
  PAYFAST_PASSPHRASE?: string
  SCOUT_DEBUG?: string
}
