export interface TrolleyScoutEnv {
  DB?: D1Database
  APP_URL?: string
  STRIPE_HOUSEHOLD_PRICE_ID?: string
  STRIPE_SCOUT_PRICE_ID?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
}
