import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, LinkSimple, Minus, Plus, X } from '@phosphor-icons/react'

import { catalogueFileUrl, leafletPdfUrl, withProxiedFallbacks } from '../services/catalogueFiles'
import type { CataloguePage, StoreLeaflet } from '../types'

const MIN_ZOOM = 0.75
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.25

export function LeafletViewer({
  leaflet,
  onClose,
}: {
  leaflet: StoreLeaflet
  onClose: () => void
}) {
  // Reading order: published page images, then an embedded PDF, then the
  // cover — each rendered with same-origin relay fallbacks so one blocked
  // CDN never turns into "preview unavailable".
  const pdfUrl = leafletPdfUrl(leaflet)
  const pages = useMemo(
    () => {
      const publishedPages = [...(leaflet.pages ?? [])]
        .sort((left, right) => left.pageNumber - right.pageNumber)
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
    [leaflet.imageUrl, leaflet.pages, pdfUrl],
  )
  const [pageIndex, setPageIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [imageCandidateIndex, setImageCandidateIndex] = useState(0)
  const [imageFailed, setImageFailed] = useState(false)
  const currentPage = pages[pageIndex]
  const imageCandidates = useMemo(
    () => currentPage ? uniqueImageUrls(currentPage) : [],
    [currentPage],
  )

  useEffect(() => {
    setPageIndex(0)
    setZoom(1)
  }, [leaflet.id])

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
  }, [onClose, pages.length])

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
          {pages.length > 0 && currentPage ? (
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
                    <p>This page could not be loaded. You can still use the official source link.</p>
                  </div>
                ) : (
                  <img
                    alt={`${cleanUiText(leaflet.retailerName)} catalogue page ${currentPage.pageNumber}`}
                    className="leaflet-page-image"
                    decoding="async"
                    onError={handlePageImageError}
                    referrerPolicy="no-referrer"
                    src={imageCandidates[imageCandidateIndex]}
                    style={{ width: `${zoom * 100}%` }}
                  />
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
              <p>You can still check the official source.</p>
            </div>
          )}
        </div>

        <footer className="leaflet-modal-foot">
          <button className="primary-button" onClick={onClose} type="button">
            Close
          </button>
          <a className="ghost-button" href={leaflet.url} rel="noreferrer" target="_blank">
            Official source
            <LinkSimple size={16} />
          </a>
        </footer>
      </div>
    </div>
  )
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
