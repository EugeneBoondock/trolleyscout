import { spendAiBudget } from './aiBudget'
import type { TrolleyScoutEnv } from './env'

/**
 * Reads a page that will not answer a plain fetch.
 *
 * Several South African retailers cannot be scouted with `fetch` at all:
 * Superbalist, Game and Amazon SA sit behind PerimeterX and answer 412 or a
 * CAPTCHA page, Checkers' search returns 403, and Dis-Chem renders its product
 * grid on the client so the HTML arrives empty. A real browser gets past the
 * first three by being a real browser, and past the last by running the page's
 * own JavaScript.
 *
 * It is metered hard. The Paid plan includes ten browser HOURS a month and
 * bills $0.09 an hour after that, which a scout sweep left unattended would
 * spend in a weekend. Every render claims its worst-case duration up front, so
 * a sweep stops rendering rather than quietly running up a bill.
 */

/** Longest a single page render is allowed to take. */
export const MAX_RENDER_SECONDS = 25

/** How long to wait for a client-rendered grid to appear. */
const DEFAULT_SETTLE_MS = 2_500

export interface RenderedPage {
  html: string
  url: string
}

export interface RenderPageOptions {
  /** A selector to wait for before reading, for client-rendered pages. */
  waitForSelector?: string
  settleMs?: number
  now?: Date
}

/**
 * Renders one page, or returns null when the browser is unavailable or the
 * month's browser budget is spent.
 *
 * Callers treat null as "this retailer could not be read this run", which is
 * the same thing they already do for a failed fetch.
 */
export async function renderPage(
  env: TrolleyScoutEnv,
  url: string,
  options: RenderPageOptions = {},
): Promise<RenderedPage | null> {
  const browserBinding = env.BROWSER
  if (!browserBinding) return null

  const now = options.now ?? new Date()
  // Claim the worst case, not the average: the meter has to be safe when a
  // page hangs, and a hung page is exactly when it costs the most.
  if (!(await spendAiBudget(env, 'browserSeconds', MAX_RENDER_SECONDS, now))) {
    return null
  }

  const puppeteer = await loadPuppeteer()
  if (!puppeteer) return null

  let browser: PuppeteerBrowser | undefined
  try {
    browser = await puppeteer.launch(browserBinding)
    const page = await browser.newPage()
    await page.goto(url, {
      timeout: MAX_RENDER_SECONDS * 1_000,
      waitUntil: 'domcontentloaded',
    })
    if (options.waitForSelector) {
      await page
        .waitForSelector(options.waitForSelector, {
          timeout: options.settleMs ?? DEFAULT_SETTLE_MS,
        })
        // A missing selector is not fatal: read whatever did render.
        .catch(() => undefined)
    }
    const html = await page.content()
    return { html, url: page.url() }
  } catch {
    return null
  } finally {
    // Without this the session stays open until keep-alive expires, still
    // burning the allowance for a page nobody is reading.
    await browser?.close().catch(() => undefined)
  }
}

/**
 * True when this retailer is worth spending browser time on.
 *
 * Rendering is roughly a thousand times more expensive than a fetch, so it is
 * reserved for shops that have actually been shown to refuse one.
 */
export function needsBrowserRender(retailerId: string): boolean {
  return BROWSER_ONLY_RETAILERS.has(retailerId)
}

/**
 * Shops proven to refuse a plain fetch, with what they answered on
 * 2026-08-06 when probed directly from a Worker-style request.
 */
export const BROWSER_ONLY_RETAILERS = new Set([
  'superbalist', // PerimeterX: 404 plus a CAPTCHA page
  'game', // PerimeterX: 412 with a /blocked redirect
  'amazon-za', // challenge page, 2.2KB of nothing
  'checkers', // 403 on search
  'shoprite', // same platform as Checkers
  'dischem', // grid rendered on the client
  'makro', // no public catalogue API
])

/** Minimal shapes of the bits of Puppeteer this module touches. */
interface PuppeteerPage {
  content(): Promise<string>
  goto(url: string, options: Record<string, unknown>): Promise<unknown>
  url(): string
  waitForSelector(
    selector: string,
    options: Record<string, unknown>,
  ): Promise<unknown>
}

interface PuppeteerBrowser {
  close(): Promise<void>
  newPage(): Promise<PuppeteerPage>
}

interface PuppeteerModule {
  launch(binding: unknown): Promise<PuppeteerBrowser>
}

/**
 * Loaded on demand so a deployment without Browser Rendering configured still
 * boots — the scouts simply skip the shops that need it.
 */
async function loadPuppeteer(): Promise<PuppeteerModule | null> {
  try {
    const module = await import('@cloudflare/puppeteer')
    return module.default as unknown as PuppeteerModule
  } catch {
    return null
  }
}
