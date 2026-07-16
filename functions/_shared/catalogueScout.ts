import {
  extractCatalogueDeals,
  extractVisionCatalogueDeals,
} from '../../src/services/catalogueDeals'
import {
  externalRetailerTargets,
  extractRetailerLeafletsFromHtml,
} from '../../src/services/scoutSources'
import type { StoreLeaflet } from '../../src/types'
import {
  type DealSnapshot,
  readDealSnapshots,
  saveDealSnapshots,
} from './dealSnapshotStore'
import type { TrolleyScoutEnv } from './env'

const MAX_DOCUMENT_BYTES = 18 * 1024 * 1024
const MAX_PAGE_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_DOCUMENTS_PER_RUN = 4
const MAX_PAGES_PER_CATALOGUE = 1
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

interface VisionChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>
}
const CATALOGUE_VISION_PROMPT = `You are reading a South African supermarket catalogue page. Return only valid JSON in this exact shape:
{"deals":[{"title":"Brand and product with size","price":"R0.00","previousPrice":"R0.00"}]}

The "title" must be the product's printed name exactly as a shopper would read it on the pack or label — brand, product and pack size, e.g. "Huggies Baby Soft Diapers Size 4 44s" or "Sunfoil Sunflower Oil 2L".

Hard rules:
- title MUST be the actual product name copied from the label. NEVER describe the picture, position or appearance. Reject phrases like "red boxed product", "displayed at the top right", "is shown", "located", "various items". If you cannot read a real product name, omit that deal entirely.
- Do NOT output banner text as a title: skip "Any 2 for", "Any 3 for", "SAVE", "SPECIAL", "DEAL", "FROM", "%", category headings, dates and terms.
- price is the single selling price shown for that product, formatted like "R69.99".
- Omit previousPrice unless a struck-through or "was" price is printed for that product.
- Never guess obscured text or a price. Only include products whose name AND price you can read clearly.
- Return at most 30 deals and no prose outside the JSON.`

export interface CatalogueScoutResult {
  dealCount: number
  discoveredLeafletCount: number
  scannedDocumentCount: number
}

export function selectUnscannedLeaflets(
  leaflets: StoreLeaflet[],
  snapshots: Map<string, DealSnapshot>,
  limit = MAX_DOCUMENTS_PER_RUN,
) {
  const scannedUrls = new Set(
    Array.from(snapshots.values()).flatMap((snapshot) =>
      snapshot.deals
        .filter((deal) => deal.sourceLabel === 'Catalogue scan')
        .map((deal) => deal.productUrl),
    ),
  )
  const selectedRetailers = new Set<string>()

  return leaflets.filter((leaflet) => {
    const documentUrl = catalogueDocumentUrl(leaflet)

    if (
      !documentUrl ||
      scannedUrls.has(documentUrl) ||
      selectedRetailers.has(leaflet.retailerId) ||
      !isPublicDocumentUrl(documentUrl) ||
      selectedRetailers.size >= limit
    ) {
      return false
    }

    selectedRetailers.add(leaflet.retailerId)
    return true
  })
}

export function flippingBookPagerUrl(leaflet: StoreLeaflet) {
  try {
    const url = new URL(leaflet.url)

    if (!url.pathname.toLowerCase().endsWith('/index.html')) {
      return undefined
    }

    return new URL('files/assets/pager.js', url).toString()
  } catch {
    return undefined
  }
}

export function flippingBookPageUrls(
  leaflet: StoreLeaflet,
  pager: unknown,
  limit = MAX_PAGES_PER_CATALOGUE,
) {
  const pagerUrl = flippingBookPagerUrl(leaflet)
  const pages = recordValue(pager, 'pages')
  const structure = recordValue(pages, 'structure')

  if (!pagerUrl || !Array.isArray(structure)) {
    return []
  }

  return structure.slice(0, limit).map((_page, index) => {
    const pageNumber = String(index + 1).padStart(4, '0')
    return new URL(
      `flash/pages/page${pageNumber}_w.webp`,
      pagerUrl,
    ).toString()
  })
}

export async function runCatalogueScout(
  env: TrolleyScoutEnv,
  leaflets: StoreLeaflet[],
): Promise<CatalogueScoutResult> {
  if (!env.AI || !env.DB) {
    return { dealCount: 0, discoveredLeafletCount: 0, scannedDocumentCount: 0 }
  }

  const [snapshots, externalLeaflets] = await Promise.all([
    readDealSnapshots(env),
    discoverExternalRetailerLeaflets(),
  ])
  const selected = selectUnscannedLeaflets(
    [
      ...leaflets.filter((leaflet) => flippingBookPagerUrl(leaflet)),
      ...externalLeaflets,
      ...leaflets.filter((leaflet) => !flippingBookPagerUrl(leaflet)),
    ],
    snapshots,
  )
  const scans = []

  for (const leaflet of selected) {
    scans.push(await scanCatalogueDocument(env.AI, leaflet, env.SCOUT_DEBUG === 'true'))
  }
  const entries = scans
    .filter((scan) => scan.deals.length > 0)
    .map((scan) => ({
      checkedAt: scan.checkedAt,
      deals: scan.deals,
      retailerId: scan.leaflet.retailerId,
      sourceLabel: 'Catalogue scan',
    }))

  await saveDealSnapshots(env, entries)

  return {
    dealCount: entries.reduce((total, entry) => total + entry.deals.length, 0),
    discoveredLeafletCount: externalLeaflets.length,
    scannedDocumentCount: scans.length,
  }
}

async function discoverExternalRetailerLeaflets() {
  const capturedAt = new Date().toISOString()
  const settled = await Promise.all(
    externalRetailerTargets.map(async (target) => {
      try {
        const response = await fetch(target.sourceUrl, {
          headers: {
            accept: 'text/html,application/xhtml+xml',
            'user-agent': BROWSER_USER_AGENT,
          },
        })

        if (!response.ok) {
          return []
        }

        return extractRetailerLeafletsFromHtml(target, await response.text(), capturedAt)
      } catch {
        return []
      }
    }),
  )

  return settled.flat()
}

async function scanCatalogueDocument(ai: Ai, leaflet: StoreLeaflet, debug: boolean) {
  const checkedAt = new Date().toISOString()
  const documentUrl = catalogueDocumentUrl(leaflet)!

  try {
    const pageDeals = await scanInteractiveCatalogue(ai, leaflet, checkedAt, debug)

    if (pageDeals.length > 0) {
      return { checkedAt, deals: pageDeals, leaflet }
    }

    const response = await fetch(documentUrl, {
      headers: {
        accept: 'application/pdf',
        'user-agent': BROWSER_USER_AGENT,
      },
    })
    const declaredSize = Number(response.headers.get('content-length') ?? 0)
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()

    if (
      !response.ok ||
      (declaredSize > 0 && declaredSize > MAX_DOCUMENT_BYTES) ||
      (contentType !== 'application/pdf' && !response.url.toLowerCase().includes('.pdf'))
    ) {
      return { checkedAt, deals: [], leaflet }
    }

    const document = await response.arrayBuffer()

    if (document.byteLength === 0 || document.byteLength > MAX_DOCUMENT_BYTES) {
      return { checkedAt, deals: [], leaflet }
    }

    const conversion = await ai.toMarkdown(
      {
        blob: new Blob([document], { type: 'application/pdf' }),
        name: catalogueFileName(documentUrl),
      },
      {
        conversionOptions: {
          pdf: {
            images: {
              convert: true,
              descriptionLanguage: 'en',
              maxConvertedImages: 12,
            },
            metadata: false,
          },
        },
      },
    )

    if (conversion.format !== 'markdown') {
      debugCatalogue(debug, leaflet, {
        error: conversion.error,
        format: conversion.format,
      })
      return { checkedAt, deals: [], leaflet }
    }

    const deals = extractCatalogueDeals({
      capturedAt: checkedAt,
      imageUrl: leaflet.imageUrl,
      markdown: conversion.data,
      retailerId: leaflet.retailerId,
      retailerName: leaflet.retailerName,
      sourceUrl: documentUrl,
    })

    debugCatalogue(debug, leaflet, {
      dealCount: deals.length,
      format: conversion.format,
      markdownLength: conversion.data.length,
      sample: conversion.data.slice(0, 1600),
    })

    return {
      checkedAt,
      deals,
      leaflet,
    }
  } catch {
    return { checkedAt, deals: [], leaflet }
  }
}

async function scanInteractiveCatalogue(
  ai: Ai,
  leaflet: StoreLeaflet,
  checkedAt: string,
  debug: boolean,
) {
  const pagerUrl = flippingBookPagerUrl(leaflet)

  if (!pagerUrl) {
    return []
  }

  try {
    const pagerResponse = await fetch(pagerUrl, {
      headers: {
        accept: 'application/json,text/javascript',
        'user-agent': BROWSER_USER_AGENT,
      },
    })

    if (!pagerResponse.ok) {
      return []
    }

    const pageUrls = flippingBookPageUrls(leaflet, await pagerResponse.json())
    const pages = (
      await Promise.all(
        pageUrls.map(async (pageUrl, index) => {
          try {
            const response = await fetch(pageUrl, {
              headers: {
                accept: 'image/webp,image/jpeg,image/png',
                'user-agent': BROWSER_USER_AGENT,
              },
            })
            const declaredSize = Number(response.headers.get('content-length') ?? 0)

            if (!response.ok || (declaredSize > 0 && declaredSize > MAX_PAGE_IMAGE_BYTES)) {
              return undefined
            }

            const image = await response.arrayBuffer()

            if (image.byteLength === 0 || image.byteLength > MAX_PAGE_IMAGE_BYTES) {
              return undefined
            }

            return {
              bytes: new Uint8Array(image),
              blob: new Blob([image], {
                type: response.headers.get('content-type') ?? 'image/webp',
              }),
              contentType: response.headers.get('content-type') ?? 'image/webp',
              name: `page-${index + 1}.webp`,
              pageUrl,
            }
          } catch {
            return undefined
          }
        }),
      )
    ).filter((page): page is NonNullable<typeof page> => Boolean(page))

    if (pages.length === 0) {
      return []
    }

    const visionDeals = (
      await Promise.all(
        pages.map(async (page, pageIndex) => {
          try {
            // Mistral Small 3.1 is a vision model that emits the structured
            // JSON directly. (Gemma 4 is a reasoning model that spends the whole
            // token budget on chain-of-thought and never returns the JSON, and
            // Llama vision requires accepting a Meta licence on the account.)
            // The OpenAI-style chat call is cast because the generated
            // per-model binding types don't cover this compat endpoint.
            const runVision = ai.run as unknown as (
              model: string,
              input: unknown,
            ) => Promise<VisionChatResponse>
            const output = await runVision('@cf/mistralai/mistral-small-3.1-24b-instruct', {
              max_completion_tokens: 2400,
              messages: [
                {
                  content: [
                    { text: CATALOGUE_VISION_PROMPT, type: 'text' },
                    {
                      image_url: {
                        detail: 'high',
                        url: imageDataUrl(page.bytes, page.contentType),
                      },
                      type: 'image_url',
                    },
                  ],
                  role: 'user',
                },
              ],
              response_format: {
                json_schema: {
                  name: 'catalogue_deals',
                  schema: {
                    additionalProperties: false,
                    properties: {
                      deals: {
                        items: {
                          additionalProperties: false,
                          properties: {
                            previousPrice: { type: 'string' },
                            price: { type: 'string' },
                            title: { type: 'string' },
                          },
                          required: ['title', 'price'],
                          type: 'object',
                        },
                        maxItems: 30,
                        type: 'array',
                      },
                    },
                    required: ['deals'],
                    type: 'object',
                  },
                  strict: true,
                },
                type: 'json_schema',
              },
              temperature: 0.1,
            })

            return extractVisionCatalogueDeals({
              capturedAt: checkedAt,
              imageUrl: page.pageUrl,
              markdown: output.choices?.[0]?.message?.content ?? '',
              pageNumber: pageIndex + 1,
              retailerId: leaflet.retailerId,
              retailerName: leaflet.retailerName,
              sourceUrl: leaflet.documentUrl ?? leaflet.url,
            })
          } catch (error) {
            debugCatalogue(debug, leaflet, {
              error: error instanceof Error ? error.message : String(error),
              eventStage: 'page_vision',
            })
            return []
          }
        }),
      )
    ).flat()

    // Only the strict structured-vision output is trusted. We deliberately do
    // NOT fall back to ai.toMarkdown image description: on promotional collages
    // that produces prose ("a red boxed product at the top right") which reads
    // as garbage product names. Storing nothing beats storing a scene caption.
    debugCatalogue(debug, leaflet, {
      dealCount: visionDeals.length,
      eventStage: 'page_vision',
      pageCount: pages.length,
    })

    return visionDeals
  } catch (error) {
    debugCatalogue(debug, leaflet, {
      error: error instanceof Error ? error.message : String(error),
      eventStage: 'page_images',
    })
    return []
  }
}

function debugCatalogue(
  enabled: boolean,
  leaflet: StoreLeaflet,
  details: Record<string, unknown>,
) {
  if (enabled) {
    console.log(JSON.stringify({
      event: 'catalogue_debug',
      leaflet: leaflet.name,
      retailer: leaflet.retailerName,
      ...details,
    }))
  }
}

function imageDataUrl(bytes: Uint8Array, contentType: string) {
  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return `data:${contentType};base64,${btoa(binary)}`
}

function catalogueDocumentUrl(leaflet: StoreLeaflet) {
  if (leaflet.documentUrl) {
    return leaflet.documentUrl
  }

  return leaflet.url.toLowerCase().includes('.pdf') ? leaflet.url : undefined
}

function catalogueFileName(url: string) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').at(-1) ?? 'catalogue.pdf')
    return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`
  } catch {
    return 'catalogue.pdf'
  }
}

function isPublicDocumentUrl(value: string) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()

    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      hostname !== 'localhost' &&
      hostname !== '0.0.0.0' &&
      hostname !== '127.0.0.1' &&
      hostname !== '[::1]' &&
      !hostname.endsWith('.local')
    )
  } catch {
    return false
  }
}

function recordValue(value: unknown, key: string) {
  return typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined
}
