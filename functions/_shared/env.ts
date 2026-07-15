export interface TrolleyScoutEnv {
  AI?: Ai
  DB?: D1Database
  APP_URL?: string
  PAYFAST_MERCHANT_ID?: string
  PAYFAST_MERCHANT_KEY?: string
  PAYFAST_MODE?: 'sandbox' | 'live'
  PAYFAST_PASSPHRASE?: string
}
