import { extractCatalogueDeals } from '../../src/services/catalogueDeals'
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
const MAX_DOCUMENTS_PER_RUN = 6
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

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
    [...externalLeaflets, ...leaflets],
    snapshots,
  )
  const scans = await Promise.all(selected.map((leaflet) => scanCatalogueDocument(env.AI!, leaflet)))
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

async function scanCatalogueDocument(ai: Ai, leaflet: StoreLeaflet) {
  const checkedAt = new Date().toISOString()
  const documentUrl = catalogueDocumentUrl(leaflet)!

  try {
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
      return { checkedAt, deals: [], leaflet }
    }

    return {
      checkedAt,
      deals: extractCatalogueDeals({
        capturedAt: checkedAt,
        imageUrl: leaflet.imageUrl,
        markdown: conversion.data,
        retailerId: leaflet.retailerId,
        retailerName: leaflet.retailerName,
        sourceUrl: documentUrl,
      }),
      leaflet,
    }
  } catch {
    return { checkedAt, deals: [], leaflet }
  }
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
