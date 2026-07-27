import type {
  DiscoveredDeal,
  Retailer,
  StoreLeaflet,
} from '../types'

export interface DashboardStoryFrame {
  catalogue?: StoreLeaflet
  deal?: DiscoveredDeal
  id: string
  imageUrl: string
  imageUrls: string[]
  kind: 'catalogue' | 'deal'
  pageNumber?: number
  sourceUrl: string
  subtitle?: string
  title: string
}

export interface DashboardStory {
  frames: DashboardStoryFrame[]
  id: string
  logoUrl?: string
  retailerName: string
}

const MAX_STORIES = 16
const MAX_FRAMES_PER_STORY = 40

interface MutableStory {
  catalogues: DashboardStoryFrame[]
  deals: DashboardStoryFrame[]
  id: string
  retailerName: string
}

export function buildDashboardStories(
  catalogues: StoreLeaflet[],
  deals: DiscoveredDeal[],
  retailers: Array<Pick<Retailer, 'id' | 'logoUrl' | 'name'>>,
): DashboardStory[] {
  const groups = new Map<string, MutableStory>()
  const order: string[] = []

  const storyFor = (id: string, name: string) => {
    const existing = groups.get(id)
    if (existing) return existing
    if (groups.size >= MAX_STORIES) return undefined
    const created: MutableStory = {
      catalogues: [],
      deals: [],
      id,
      retailerName: name,
    }
    groups.set(id, created)
    order.push(id)
    return created
  }

  for (const catalogue of catalogues) {
    const group = storyFor(catalogue.retailerId, catalogue.retailerName)
    if (!group || group.catalogues.length >= MAX_FRAMES_PER_STORY) continue
    const pages = [...(catalogue.pages ?? [])]
      .filter((page) => page.imageUrl.trim().length > 0)
      .sort((left, right) => left.pageNumber - right.pageNumber)

    if (pages.length > 0) {
      for (const page of pages.slice(
        0,
        MAX_FRAMES_PER_STORY - group.catalogues.length,
      )) {
        group.catalogues.push({
          catalogue,
          id: `${catalogue.id}:page:${page.pageNumber}`,
          imageUrl: page.imageUrl,
          imageUrls: unique([page.imageUrl, ...(page.fallbacks ?? [])]),
          kind: 'catalogue',
          pageNumber: page.pageNumber,
          sourceUrl: catalogue.url,
          subtitle: `Page ${page.pageNumber} of ${pages.length}`,
          title: catalogue.name,
        })
      }
    } else if (catalogue.imageUrl) {
      group.catalogues.push({
        catalogue,
        id: `${catalogue.id}:cover`,
        imageUrl: catalogue.imageUrl,
        imageUrls: [catalogue.imageUrl],
        kind: 'catalogue',
        pageNumber: 1,
        sourceUrl: catalogue.url,
        subtitle: 'Catalogue cover',
        title: catalogue.name,
      })
    }
  }

  for (const deal of deals) {
    const imageUrl = deal.imageUrl ?? deal.images?.find(Boolean)
    if (!imageUrl) continue
    const group = storyFor(deal.retailerId, deal.retailerName)
    if (
      !group ||
      group.catalogues.length + group.deals.length >= MAX_FRAMES_PER_STORY
    ) {
      continue
    }
    group.deals.push({
      deal,
      id: `deal:${deal.id}`,
      imageUrl,
      imageUrls: unique([imageUrl, ...(deal.images ?? [])]),
      kind: 'deal',
      sourceUrl: deal.productUrl,
      subtitle: deal.priceText,
      title: deal.title,
    })
  }

  const retailerLookup = new Map(retailers.map((retailer) => [retailer.id, retailer]))
  return order
    .map((id) => {
      const group = groups.get(id)!
      const retailer = retailerLookup.get(id)
      return {
        frames: [...group.catalogues, ...group.deals].slice(0, MAX_FRAMES_PER_STORY),
        id,
        logoUrl: retailer?.logoUrl,
        retailerName: retailer?.name ?? group.retailerName,
      }
    })
    .filter((story) => story.frames.length > 0)
    .slice(0, MAX_STORIES)
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}
