import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  LinkSimple,
  Minus,
  Plus,
  ShareNetwork,
  X,
} from '@phosphor-icons/react'

import {
  catalogueFileUrl,
  leafletPdfUrl,
  loadCataloguePages,
  withProxiedFallbacks,
} from '../services/catalogueFiles'
import { catalogueShareUrl } from '../services/catalogueShare'
import type { CataloguePage, DiscoveredDeal, ImageCrop, StoreLeaflet } from '../types'

const MIN_ZOOM = 0.75
const MAX_ZOOM = 5
const ZOOM_STEP = 0.25

export function LeafletViewer({
  deals = [],
  leaflet,
  onClose,
}: {
  deals?: DiscoveredDeal[]
  leaflet: StoreLeaflet
  onClose: () => void
}) {
  // Reading order: published page images, then an embedded PDF, then the
  // cover — each rendered with same-origin relay fallbacks so one blocked
  // CDN never turns into "preview unavailable".
  const pdfUrl = leafletPdfUrl(leaflet)
  const [loadedPages, setLoadedPages] = useState<CataloguePage[]>()
  const [loadingPages, setLoadingPages] = useState(false)
  const [pageLoadFailed, setPageLoadFailed] = useState(false)
  const pages = useMemo(
    () => {
      const publishedPages = [...(loadedPages ?? leaflet.pages ?? [])]
        .sort((left, right) => left.pageNumber - right.pageNumber)
      // A single generated image is commonly only a PDF cover. Use the full
      // document so every published page remains readable and zoomable.
      if (pdfUrl && publishedPages.length <= 1) {
        return []
      }
      if (publishedPages.length > 0 || pdfUrl || !leaflet.imageUrl) {
        return publishedPages
      }
      return [{
        height: 0,
        imageUrl: leaflet.imageUrl,
        pageNumber: 1,
        width: 0,
      }]
    },
    [leaflet.imageUrl, leaflet.pages, loadedPages, pdfUrl],
  )
  const [pageIndex, setPageIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [imageCandidateIndex, setImageCandidateIndex] = useState(0)
  const [imageFailed, setImageFailed] = useState(false)
  const [shareStatus, setShareStatus] = useState('')
  const [selectedDeal, setSelectedDeal] = useState<DiscoveredDeal>()
  const currentPage = pages[pageIndex]
  const imageCandidates = useMemo(
    () => currentPage ? uniqueImageUrls(currentPage) : [],
    [currentPage],
  )
  const currentPageDeals = useMemo(
    () => currentPage
      ? deals.filter((deal) => dealMatchesCataloguePage(deal, leaflet, currentPage))
      : [],
    [currentPage, deals, leaflet],
  )

  useEffect(() => {
    setPageIndex(0)
    setZoom(1)
    setSelectedDeal(undefined)
  }, [leaflet.id])

  useEffect(() => {
    setLoadedPages(undefined)
    setPageLoadFailed(false)
    if (!leaflet.pagesUrl || (leaflet.pages?.length ?? 0) > 1) {
      setLoadingPages(false)
      return
    }

    const controller = new AbortController()
    setLoadingPages(true)
    loadCataloguePages(leaflet.pagesUrl, controller.signal)
      .then((nextPages) => {
        if (nextPages.length === 0) {
          setPageLoadFailed(true)
          return
        }
        setLoadedPages(nextPages)
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setPageLoadFailed(true)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingPages(false)
        }
      })

    return () => controller.abort()
  }, [leaflet.id, leaflet.pages, leaflet.pagesUrl])

  useEffect(() => {
    setPageIndex((current) => pages.length === 0 ? 0 : Math.min(current, pages.length - 1))
  }, [pages.length])

  useEffect(() => {
    setImageCandidateIndex(0)
    setImageFailed(imageCandidates.length === 0)
    setZoom(1)
  }, [imageCandidates.length, leaflet.id, pageIndex])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (selectedDeal) {
          setSelectedDeal(undefined)
          return
        }
        onClose()
        return
      }

      if (pages.length === 0) {
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setPageIndex((current) => Math.max(0, current - 1))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setPageIndex((current) => Math.min(pages.length - 1, current + 1))
      } else if (event.key === 'Home') {
        event.preventDefault()
        setPageIndex(0)
      } else if (event.key === 'End') {
        event.preventDefault()
        setPageIndex(pages.length - 1)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose, pages.length, selectedDeal])

  function selectPage(index: number) {
    setPageIndex(Math.max(0, Math.min(pages.length - 1, index)))
  }

  function handlePageImageError() {
    if (imageCandidateIndex + 1 < imageCandidates.length) {
      setImageCandidateIndex((current) => current + 1)
      return
    }

    setImageFailed(true)
  }

  async function shareCatalogue() {
    const url = catalogueShareUrl(leaflet)
    const shareData = {
      text: `Read ${cleanUiText(leaflet.name)} from ${cleanUiText(leaflet.retailerName)} on Trolley Scout.`,
      title: `${cleanUiText(leaflet.retailerName)} catalogue`,
      url,
    }
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share(shareData)
        setShareStatus('Catalogue shared.')
        return
      }
      await navigator.clipboard.writeText(url)
      setShareStatus('Catalogue link copied.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setShareStatus('The catalogue link could not be shared.')
    }
  }

  return (
    <div
      className="leaflet-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      role="presentation"
    >
      <div
        aria-keyshortcuts="Escape ArrowLeft ArrowRight Home End"
        aria-labelledby="leaflet-modal-title"
        aria-modal="true"
        className="leaflet-modal"
        role="dialog"
      >
        <header className="leaflet-modal-head">
          <div>
            <p className="leaflet-retailer">{cleanUiText(leaflet.retailerName)}</p>
            <h3 id="leaflet-modal-title">{cleanUiText(leaflet.name)}</h3>
            {(leaflet.validFrom || leaflet.validTo) && (
              <p className="leaflet-dates">
                {describeLeafletDates(leaflet.validFrom, leaflet.validTo)}
              </p>
            )}
          </div>
          <button
            aria-label="Close catalogue"
            autoFocus
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </header>

        <div className="leaflet-modal-body">
          {loadingPages ? (
            <div className="leaflet-page-loading" role="status">
              <span aria-hidden="true" />
              <strong>Loading every catalogue page</strong>
              <p>The high-quality reader will open in a moment.</p>
            </div>
          ) : pages.length > 0 && currentPage ? (
            <div className="leaflet-reader">
              <div className="leaflet-reader-toolbar">
                <div className="leaflet-page-controls" aria-label="Catalogue page controls">
                  <button
                    aria-label="Previous page"
                    disabled={pageIndex === 0}
                    onClick={() => selectPage(pageIndex - 1)}
                    type="button"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <span aria-live="polite">Page {pageIndex + 1} of {pages.length}</span>
                  <button
                    aria-label="Next page"
                    disabled={pageIndex === pages.length - 1}
                    onClick={() => selectPage(pageIndex + 1)}
                    type="button"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>

                <div className="leaflet-zoom-controls" aria-label="Catalogue zoom controls">
                  <button
                    aria-label="Zoom out"
                    disabled={zoom <= MIN_ZOOM}
                    onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))}
                    type="button"
                  >
                    <Minus size={15} />
                  </button>
                  <button
                    aria-label={`Reset zoom to 100%, current zoom ${Math.round(zoom * 100)}%`}
                    onClick={() => setZoom(1)}
                    type="button"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    aria-label="Zoom in"
                    disabled={zoom >= MAX_ZOOM}
                    onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))}
                    type="button"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              <div
                aria-label={`Page ${pageIndex + 1} reading area`}
                className="leaflet-page-stage"
                role="region"
              >
                {imageFailed ? (
                  <div className="leaflet-image-failure" role="status">
                    <strong>Page image unavailable</strong>
                    <p>This page could not be loaded. You can still use the catalogue source link.</p>
                  </div>
                ) : (
                  <div
                    className="leaflet-page-canvas"
                    style={{ width: `${zoom * 100}%` }}
                  >
                    <img
                      alt={`${cleanUiText(leaflet.retailerName)} catalogue page ${currentPage.pageNumber}`}
                      className="leaflet-page-image"
                      decoding="async"
                      onError={handlePageImageError}
                      referrerPolicy="no-referrer"
                      src={imageCandidates[imageCandidateIndex]}
                    />
                    {currentPageDeals.map((deal) => (
                      <button
                        aria-label={`View ${cleanUiText(deal.title)} from page ${currentPage.pageNumber}`}
                        className="leaflet-product-hotspot"
                        key={deal.id}
                        onClick={() => setSelectedDeal(deal)}
                        style={cropPositionStyle(deal.imageCrop!)}
                        title={`${cleanUiText(deal.title)}${deal.priceText ? `, ${cleanUiText(deal.priceText)}` : ''}`}
                        type="button"
                      >
                        <span aria-hidden="true">+</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="leaflet-page-thumbnails" aria-label="Catalogue pages">
                {pages.map((page, index) => (
                  <button
                    aria-current={index === pageIndex ? 'page' : undefined}
                    aria-label={`Go to page ${index + 1}`}
                    className="leaflet-page-thumbnail"
                    key={`${page.pageNumber}-${page.imageUrl}`}
                    onClick={() => selectPage(index)}
                    type="button"
                  >
                    <img
                      alt=""
                      loading="lazy"
                      onError={(event) => { event.currentTarget.hidden = true }}
                      referrerPolicy="no-referrer"
                      src={page.imageUrl}
                    />
                    <span>{index + 1}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : pdfUrl ? (
            <object
              aria-label={`${cleanUiText(leaflet.retailerName)} catalogue PDF`}
              className="leaflet-pdf-embed"
              data={catalogueFileUrl(pdfUrl) ?? pdfUrl}
              type="application/pdf"
            >
              <div className="leaflet-pdf-fallback" role="status">
                {leaflet.imageUrl && (
                  <img
                    alt={`${cleanUiText(leaflet.retailerName)} catalogue cover`}
                    className="leaflet-cover-only"
                    onError={(event) => { event.currentTarget.hidden = true }}
                    referrerPolicy="no-referrer"
                    src={leaflet.imageUrl}
                  />
                )}
                <p>This catalogue is a PDF your browser cannot show inline.</p>
                <a
                  className="ghost-button"
                  href={catalogueFileUrl(pdfUrl) ?? pdfUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open the catalogue PDF
                  <LinkSimple size={16} />
                </a>
              </div>
            </object>
          ) : (
            <div className="leaflet-image-failure" role="status">
              <strong>Catalogue preview unavailable</strong>
              <p>
                {pageLoadFailed
                  ? 'The page list could not be loaded. You can still check the catalogue source.'
                  : 'You can still check the catalogue source.'}
              </p>
            </div>
          )}
        </div>

        <footer className="leaflet-modal-foot">
          <span aria-live="polite" className="leaflet-share-status">
            {shareStatus}
          </span>
          <button className="ghost-button" onClick={shareCatalogue} type="button">
            Share
            <ShareNetwork size={16} />
          </button>
          <button className="primary-button" onClick={onClose} type="button">
            Close
          </button>
          <a className="ghost-button" href={leaflet.url} rel="noreferrer" target="_blank">
            {isCatalogueDirectoryLeaflet(leaflet)
              ? 'Catalogue source'
              : 'Official source'}
            <LinkSimple size={16} />
          </a>
        </footer>
      </div>

      {selectedDeal && (
        <CatalogueProductDialog
          deal={selectedDeal}
          onClose={() => setSelectedDeal(undefined)}
          page={pages.find((page) => page.pageNumber === selectedDeal.pageNumber)}
        />
      )}
    </div>
  )
}

function CatalogueProductDialog({
  deal,
  onClose,
  page,
}: {
  deal: DiscoveredDeal
  onClose: () => void
  page?: CataloguePage
}) {
  const crop = deal.imageCrop!
  const imageUrl = deal.imageUrl ?? page?.imageUrl
  const cropAspect = page?.width && page.height
    ? (page.width * crop.width) / (page.height * crop.height)
    : crop.width / crop.height

  return (
    <div
      className="leaflet-product-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="presentation"
    >
      <article
        aria-label={cleanUiText(deal.title)}
        aria-modal="true"
        className="leaflet-product-dialog"
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow">Catalogue find</p>
            <h3>{cleanUiText(deal.title)}</h3>
          </div>
          <button aria-label="Close product details" className="icon-button" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </header>

        {imageUrl && (
          <div className="leaflet-product-crop" style={{ aspectRatio: cropAspect }}>
            <img
              alt={`Cropped catalogue image for ${cleanUiText(deal.title)}`}
              referrerPolicy="no-referrer"
              src={imageUrl}
              style={{
                transform: `translate(${-crop.x * 100}%, ${-crop.y * 100}%)`,
                width: `${100 / crop.width}%`,
              }}
            />
          </div>
        )}

        <div className="leaflet-product-copy">
          <span>{cleanUiText(deal.retailerName)}</span>
          {deal.priceText && <strong>{cleanUiText(deal.priceText)}</strong>}
          {deal.savingText && <p>{cleanUiText(deal.savingText)}</p>}
          {deal.pageNumber && <small>Found on page {deal.pageNumber}</small>}
        </div>

        <footer>
          <button className="ghost-button" onClick={onClose} type="button">Back to catalogue</button>
          <a className="primary-button" href={deal.productUrl || deal.sourceUrl} rel="noreferrer" target="_blank">
            View official item
            <LinkSimple size={16} />
          </a>
        </footer>
      </article>
    </div>
  )
}

function dealMatchesCataloguePage(
  deal: DiscoveredDeal,
  leaflet: StoreLeaflet,
  page: CataloguePage,
): boolean {
  if (
    deal.retailerId !== leaflet.retailerId ||
    deal.pageNumber !== page.pageNumber ||
    !isValidImageCrop(deal.imageCrop)
  ) {
    return false
  }

  const pageUrls = new Set([page.imageUrl, ...(page.fallbacks ?? [])].map(normalizeImageIdentity))
  const matchesPageImage = deal.imageUrl
    ? pageUrls.has(normalizeImageIdentity(deal.imageUrl))
    : false
  const matchesSource = [deal.sourceUrl, deal.catalogueDeepLink, deal.productUrl]
    .filter(Boolean)
    .some((url) => normalizeUrl(url!) === normalizeUrl(leaflet.url))

  return matchesPageImage || matchesSource
}

function isValidImageCrop(crop?: ImageCrop): crop is ImageCrop {
  return Boolean(
    crop &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= 1.001 &&
    crop.y + crop.height <= 1.001,
  )
}

function cropPositionStyle(crop: ImageCrop) {
  return {
    height: `${crop.height * 100}%`,
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
  }
}

function normalizeImageIdentity(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin)
    parsed.search = ''
    return parsed.toString()
  } catch {
    return url.split('?')[0]
  }
}

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '')
}

function isCatalogueDirectoryLeaflet(leaflet: StoreLeaflet): boolean {
  return new Set([
    'Catalogue Specials',
    'Guzzle',
    'Latest Specials',
    'My Catalogue',
  ]).has(leaflet.sourceLabel ?? '')
}

function uniqueImageUrls(page: CataloguePage): string[] {
  return withProxiedFallbacks([page.imageUrl, ...(page.fallbacks ?? [])])
}

function describeLeafletDates(validFrom?: string, validTo?: string): string {
  const format = (iso?: string) => {
    if (!iso) {
      return ''
    }

    const date = new Date(`${iso}T00:00:00`)
    return Number.isNaN(date.getTime())
      ? iso
      : date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
  }

  if (validFrom && validTo) {
    return `Valid ${format(validFrom)} to ${format(validTo)}`
  }

  return validTo ? `Valid until ${format(validTo)}` : `From ${format(validFrom)}`
}

function cleanUiText(value: string): string {
  return value.replace(/\s*\u2014\s*/g, ': ')
}
