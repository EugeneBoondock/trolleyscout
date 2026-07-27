import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  LinkSimple,
  Storefront,
  X,
} from '@phosphor-icons/react'

import {
  loadCataloguePages,
  withProxiedFallbacks,
} from '../services/catalogueFiles'
import { loadDiscovery } from '../services/apiClient'
import {
  buildDashboardStories,
  type DashboardStory,
} from '../services/dashboardStories'
import type { DiscoveredDeal, Retailer, StoreLeaflet } from '../types'
import { LeafletViewer } from './LeafletViewer'

export function DeferredDashboardStories({
  retailers,
}: {
  retailers: Retailer[]
}) {
  const [storyData, setStoryData] = useState<{
    catalogues: StoreLeaflet[]
    deals: DiscoveredDeal[]
  }>()

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    const idleWindow = window as typeof window & {
      cancelIdleCallback?: (handle: number) => void
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number
    }
    let idleHandle: number | undefined
    let timerHandle: number | undefined

    const load = () => {
      void loadDiscovery(controller.signal)
        .then((state) => {
          if (cancelled || state.status !== 'ready') return
          setStoryData({
            catalogues: state.data.discovery.leaflets ?? [],
            deals: state.data.discovery.deals,
          })
        })
        .catch(() => undefined)
    }

    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(load, { timeout: 1_200 })
    } else {
      timerHandle = window.setTimeout(load, 350)
    }

    return () => {
      cancelled = true
      controller.abort()
      if (idleHandle !== undefined) {
        idleWindow.cancelIdleCallback?.(idleHandle)
      }
      if (timerHandle !== undefined) {
        window.clearTimeout(timerHandle)
      }
    }
  }, [])

  if (!storyData) {
    return (
      <section
        aria-label="Store stories"
        className="dashboard-stories dashboard-stories-loading"
      >
        <div className="dash-section-heading">
          <div>
            <h2 className="dash-section-label">Store stories</h2>
            <p>Loading each store when the dashboard is ready.</p>
          </div>
        </div>
        <div aria-hidden="true" className="story-reel story-reel-skeleton">
          {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
        </div>
      </section>
    )
  }

  return (
    <DashboardStories
      catalogues={storyData.catalogues}
      deals={storyData.deals}
      retailers={retailers}
    />
  )
}

export function DashboardStories({
  catalogues,
  deals,
  retailers,
}: {
  catalogues: StoreLeaflet[]
  deals: DiscoveredDeal[]
  retailers: Retailer[]
}) {
  const [loadedCataloguePages, setLoadedCataloguePages] = useState<
    Record<string, StoreLeaflet['pages']>
  >({})
  const pendingPageLoads = useRef(new Set<string>())
  const failedPageLoads = useRef(new Set<string>())
  const hydratedCatalogues = useMemo(
    () => catalogues.map((catalogue) => {
      const key = cataloguePageKey(catalogue)
      const pages = key ? loadedCataloguePages[key] : undefined
      return pages?.length ? { ...catalogue, pages } : catalogue
    }),
    [catalogues, loadedCataloguePages],
  )
  const stories = useMemo(
    () => buildDashboardStories(hydratedCatalogues, deals, retailers),
    [deals, hydratedCatalogues, retailers],
  )
  const [visibleStoryCount, setVisibleStoryCount] = useState(4)
  const [storyId, setStoryId] = useState<string>()
  const [frameIndex, setFrameIndex] = useState(0)
  const [openCatalogue, setOpenCatalogue] = useState<StoreLeaflet>()
  const story = stories.find((item) => item.id === storyId)
  const frame = story?.frames[frameIndex]

  useEffect(() => {
    setVisibleStoryCount(Math.min(4, stories.length))
  }, [stories.length])

  useEffect(() => {
    if (visibleStoryCount >= stories.length) return
    const frameHandle = window.requestAnimationFrame(() => {
      setVisibleStoryCount((current) => Math.min(stories.length, current + 2))
    })
    return () => window.cancelAnimationFrame(frameHandle)
  }, [stories.length, visibleStoryCount])

  useEffect(() => {
    const catalogue = frame?.catalogue
    const key = catalogue ? cataloguePageKey(catalogue) : undefined
    if (
      !catalogue?.pagesUrl ||
      (catalogue.pages?.length ?? 0) > 1 ||
      !key ||
      loadedCataloguePages[key]?.length ||
      pendingPageLoads.current.has(key) ||
      failedPageLoads.current.has(key)
    ) {
      return
    }

    const controller = new AbortController()
    pendingPageLoads.current.add(key)
    loadCataloguePages(catalogue.pagesUrl, controller.signal)
      .then((pages) => {
        if (pages.length === 0) {
          failedPageLoads.current.add(key)
          return
        }
        setLoadedCataloguePages((current) => ({ ...current, [key]: pages }))
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          failedPageLoads.current.add(key)
        }
      })
      .finally(() => pendingPageLoads.current.delete(key))

    return () => controller.abort()
  }, [frame?.catalogue, loadedCataloguePages])

  function openStory(selected: DashboardStory) {
    setStoryId(selected.id)
    setFrameIndex(0)
  }

  function closeStory() {
    setStoryId(undefined)
    setFrameIndex(0)
  }

  function move(direction: -1 | 1) {
    if (!story) return
    const nextFrame = frameIndex + direction
    if (nextFrame >= 0 && nextFrame < story.frames.length) {
      setFrameIndex(nextFrame)
      return
    }

    const storyIndex = stories.findIndex((item) => item.id === story.id)
    const nextStory = stories[storyIndex + direction]
    if (nextStory) {
      setStoryId(nextStory.id)
      setFrameIndex(direction > 0 ? 0 : nextStory.frames.length - 1)
    } else if (direction > 0) {
      closeStory()
    }
  }

  useEffect(() => {
    if (!story) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeStory()
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
    }
  })

  if (stories.length === 0) return null

  return (
    <section className="dashboard-stories" aria-label="Store stories">
      <div className="dash-section-heading">
        <div>
          <h2 className="dash-section-label">Store stories</h2>
          <p>Tap through catalogue pages first, then see each store’s latest deals.</p>
        </div>
      </div>
      <div className="story-reel">
        {stories.slice(0, visibleStoryCount).map((item) => (
          <button
            aria-label={`View ${cleanText(item.retailerName)} story`}
            className="story-reel-item"
            key={item.id}
            onClick={() => openStory(item)}
            type="button"
          >
            <span className="story-avatar-ring">
              <span className="story-avatar">
                {item.logoUrl ? (
                  <img alt="" loading="lazy" src={item.logoUrl} />
                ) : (
                  <Storefront aria-hidden="true" size={24} />
                )}
              </span>
            </span>
            <span>{cleanText(item.retailerName)}</span>
          </button>
        ))}
      </div>

      {story && frame && (
        <div className="story-backdrop" onClick={closeStory} role="presentation">
          <div
            aria-label={`${cleanText(story.retailerName)} story`}
            aria-modal="true"
            className="story-viewer"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div
              aria-label={`${story.frames.length} story items`}
              className="story-progress"
              role="progressbar"
              aria-valuemax={story.frames.length}
              aria-valuemin={1}
              aria-valuenow={frameIndex + 1}
            >
              {story.frames.map((item, index) => (
                <span
                  className={`story-progress-segment${index <= frameIndex ? ' is-seen' : ''}${index === frameIndex ? ' is-active' : ''}`}
                  key={item.id}
                />
              ))}
            </div>

            <header className="story-viewer-head">
              <span className="story-viewer-brand">
                {story.logoUrl ? <img alt="" src={story.logoUrl} /> : <Storefront size={20} />}
                <span>
                  <strong>{cleanText(story.retailerName)}</strong>
                  <small>{frameIndex + 1} of {story.frames.length}</small>
                </span>
              </span>
              <button aria-label="Close story" className="icon-button" onClick={closeStory} type="button">
                <X size={20} />
              </button>
            </header>

            <StoryFrameImage frame={frame} />

            <button
              aria-label="Previous story item"
              className="story-step story-step-previous"
              disabled={frameIndex === 0 && stories[0]?.id === story.id}
              onClick={() => move(-1)}
              type="button"
            >
              <ArrowLeft size={20} />
            </button>
            <button
              aria-label="Next story item"
              className="story-step story-step-next"
              onClick={() => move(1)}
              type="button"
            >
              <ArrowRight size={20} />
            </button>

            <footer className="story-viewer-foot">
              <div>
                <span className="story-frame-kind">
                  {frame.kind === 'catalogue' ? 'Catalogue' : 'Deal'}
                </span>
                <h3>{cleanText(frame.title)}</h3>
                {frame.subtitle && <p>{cleanText(frame.subtitle)}</p>}
              </div>
              {frame.kind === 'catalogue' && frame.catalogue ? (
                <button
                  className="primary-button"
                  onClick={() => setOpenCatalogue(frame.catalogue)}
                  type="button"
                >
                  Read full catalogue
                </button>
              ) : (
                <a
                  className="primary-button"
                  href={frame.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  View deal
                  <LinkSimple size={16} />
                </a>
              )}
            </footer>
          </div>
        </div>
      )}

      {openCatalogue && (
        <LeafletViewer leaflet={openCatalogue} onClose={() => setOpenCatalogue(undefined)} />
      )}
    </section>
  )
}

function StoryFrameImage({
  frame,
}: {
  frame: DashboardStory['frames'][number]
}) {
  const candidates = useMemo(
    () => withProxiedFallbacks(frame.imageUrls),
    [frame.imageUrls],
  )
  const [candidateIndex, setCandidateIndex] = useState(0)

  useEffect(() => setCandidateIndex(0), [frame.id])

  if (!candidates[candidateIndex]) {
    return (
      <div className="story-media story-media-empty">
        <Storefront size={46} />
        <span>Image unavailable</span>
      </div>
    )
  }

  return (
    <div className="story-media">
      <img
        alt={`${cleanText(frame.title)}${frame.pageNumber ? ` page ${frame.pageNumber}` : ''}`}
        decoding="async"
        onError={() => setCandidateIndex((current) => current + 1)}
        referrerPolicy="no-referrer"
        src={candidates[candidateIndex]}
      />
      {frame.deal?.soldOut && (
        <span className="deal-stock-badge story-stock-badge">Sold out</span>
      )}
    </div>
  )
}

function cleanText(value: string): string {
  return value.replace(/\s*\u2014\s*/g, ': ')
}

function cataloguePageKey(catalogue: StoreLeaflet): string | undefined {
  return catalogue.id || catalogue.pagesUrl || undefined
}
