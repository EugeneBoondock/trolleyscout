import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { CaretDown, Check, MagnifyingGlass, X } from '@phosphor-icons/react'
import clsx from 'clsx'

export const ALL_RETAILERS = 'all'

// How many stores the "Most deals" shortcut lists before the A-Z sections start.
const MOST_DEALS_LIMIT = 6

// Combining accents left behind by NFD decomposition.
const DIACRITICS = /\p{Diacritic}/gu

export interface RetailerPickerOption {
  count: number
  id: string
  name: string
}

interface RetailerPickerSection {
  options: RetailerPickerOption[]
  title: string
}

// "Café Fresh" has to answer to "cafe", so every comparison runs through the
// same accent-stripped, lower-cased form on both sides.
function normalise(value: string): string {
  return value.normalize('NFD').replace(DIACRITICS, '').toLowerCase()
}

// A Near-me store card can filter by a retailer that has no deals in the
// current feed, so the trigger falls back to a readable form of its id.
function describeUnlistedRetailer(retailerId: string): string {
  const words = retailerId.replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Selected store'
}

function groupAlphabetically(options: RetailerPickerOption[]): RetailerPickerSection[] {
  const buckets = new Map<string, RetailerPickerOption[]>()

  for (const option of options) {
    const letter = normalise(option.name).charAt(0).toUpperCase()
    const title = /[A-Z]/.test(letter) ? letter : '#'
    const bucket = buckets.get(title)
    if (bucket) {
      bucket.push(option)
    } else {
      buckets.set(title, [option])
    }
  }

  return Array.from(buckets, ([title, sectionOptions]) => ({ options: sectionOptions, title }))
    .sort((left, right) => left.title.localeCompare(right.title))
}

// Unsearched: the busiest stores first, then everyone else under A-Z headings.
// Searched: just the matches, still under A-Z headings so the shape never jumps.
function buildSections(options: RetailerPickerOption[], needle: string): RetailerPickerSection[] {
  const matches = needle
    ? options.filter((option) => normalise(option.name).includes(needle))
    : options
  const byName = [...matches].sort((left, right) => left.name.localeCompare(right.name))

  if (needle) {
    return groupAlphabetically(byName)
  }

  const mostDeals = [...matches]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, MOST_DEALS_LIMIT)
  const featured = new Set(mostDeals.map((option) => option.id))

  return [
    ...(mostDeals.length > 0 ? [{ options: mostDeals, title: 'Most deals' }] : []),
    ...groupAlphabetically(byName.filter((option) => !featured.has(option.id))),
  ]
}

function describeOption(option: RetailerPickerOption): string {
  return `${option.name}, ${option.count} ${option.count === 1 ? 'deal' : 'deals'}`
}

/**
 * Searchable replacement for the deals retailer <select>. The catalogue now
 * spans hundreds of stores, so the list lives in a popover with a filter,
 * deal counts, a "most deals" shortcut and A-Z sections.
 */
export function RetailerPicker({
  labelId,
  onChange,
  options,
  totalCount,
  value,
}: {
  labelId?: string
  onChange: (retailerId: string) => void
  options: RetailerPickerOption[]
  totalCount: number
  value: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const activeOptionRef = useRef<HTMLDivElement>(null)

  const baseId = useId()
  const listboxId = `${baseId}-listbox`
  const triggerId = `${baseId}-trigger`
  const optionDomId = (retailerId: string) => `${baseId}-option-${retailerId}`

  const needle = normalise(query.trim())
  // One pass builds everything the panel needs: the pinned "All retailers"
  // row, the sections, the flat list ArrowUp/ArrowDown walks, and the lookup
  // that turns a retailer id back into its position in that flat list.
  const { allOption, indexById, sections, showAllRow, visibleOptions } = useMemo(() => {
    const all: RetailerPickerOption = {
      count: totalCount,
      id: ALL_RETAILERS,
      name: 'All retailers',
    }
    const showAll = !needle || normalise(all.name).includes(needle)
    const grouped = buildSections(options, needle)
    const flat = [...(showAll ? [all] : []), ...grouped.flatMap((section) => section.options)]

    return {
      allOption: all,
      indexById: new Map(flat.map((option, index) => [option.id, index])),
      sections: grouped,
      showAllRow: showAll,
      visibleOptions: flat,
    }
  }, [needle, options, totalCount])

  const activeOption = visibleOptions[Math.min(activeIndex, visibleOptions.length - 1)]
  const selected = value === ALL_RETAILERS
    ? allOption
    : options.find((option) => option.id === value)
      ?? { count: 0, id: value, name: describeUnlistedRetailer(value) }

  function openPicker() {
    // Query is always cleared on close, so the current index map is unfiltered
    // and the panel can open sitting on whatever is selected.
    setActiveIndex(indexById.get(value) ?? 0)
    setIsOpen(true)
  }

  function dismissPicker() {
    setIsOpen(false)
    setQuery('')
  }

  function closePicker() {
    dismissPicker()
    triggerRef.current?.focus()
  }

  function selectOption(retailerId: string) {
    onChange(retailerId)
    closePicker()
  }

  function changeQuery(next: string) {
    setQuery(next)
    setActiveIndex(0)
  }

  function clearQuery() {
    changeQuery('')
    searchRef.current?.focus()
  }

  useEffect(() => {
    if (isOpen) {
      searchRef.current?.focus()
    }
  }, [isOpen])

  // Keep the highlighted row in view, including on open when it is the current
  // selection sitting far down the list.
  useEffect(() => {
    const node = activeOptionRef.current
    if (isOpen && node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  // Only the search field and its clear button can hold focus; the rows are
  // driven by aria-activedescendant, so Tab just cycles between those two.
  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('input, button') ?? [],
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) {
      event.preventDefault()
      return
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePicker()
      return
    }

    if (event.key === 'Tab') {
      trapFocus(event)
      return
    }

    // Row navigation belongs to the search field, so the clear button keeps
    // its own Enter and Space behaviour.
    if (event.target !== searchRef.current || visibleOptions.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % visibleOptions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (current - 1 + visibleOptions.length) % visibleOptions.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(visibleOptions.length - 1)
    } else if (event.key === 'Enter' && activeOption) {
      event.preventDefault()
      selectOption(activeOption.id)
    }
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (isOpen || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) {
      return
    }

    event.preventDefault()
    openPicker()
  }

  function renderOption(option: RetailerPickerOption) {
    const isSelected = option.id === value
    const isActive = activeOption?.id === option.id

    return (
      <div
        aria-label={describeOption(option)}
        aria-selected={isSelected}
        className={clsx(
          'retailer-picker-option',
          isActive && 'is-active',
          isSelected && 'is-selected',
        )}
        id={optionDomId(option.id)}
        key={option.id}
        onClick={() => selectOption(option.id)}
        onMouseMove={() => setActiveIndex(indexById.get(option.id) ?? 0)}
        ref={isActive ? activeOptionRef : undefined}
        role="option"
      >
        <span className="retailer-picker-option-name">{option.name}</span>
        <span className="retailer-picker-option-count">{option.count}</span>
        {isSelected && <Check aria-hidden="true" size={15} weight="bold" />}
      </div>
    )
  }

  return (
    <div className="retailer-picker" ref={rootRef}>
      <button
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={labelId ? `${labelId} ${triggerId}` : undefined}
        className="retailer-picker-trigger"
        id={triggerId}
        onClick={() => isOpen ? closePicker() : openPicker()}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span className="retailer-picker-trigger-name">{selected.name}</span>
        <span className="retailer-picker-count">{selected.count}</span>
        <span className="sr-only">{selected.count === 1 ? 'deal' : 'deals'}</span>
        <CaretDown aria-hidden="true" size={15} weight="bold" />
      </button>

      {isOpen && (
        <div
          className="retailer-picker-panel"
          onKeyDown={handlePanelKeyDown}
          ref={panelRef}
          role="presentation"
        >
          <div className="search-field retailer-picker-search">
            <MagnifyingGlass aria-hidden="true" size={18} />
            <input
              aria-activedescendant={activeOption ? optionDomId(activeOption.id) : undefined}
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded
              aria-label="Search stores"
              autoComplete="off"
              onChange={(event) => changeQuery(event.target.value)}
              placeholder="Search stores"
              ref={searchRef}
              role="combobox"
              type="search"
              value={query}
            />
            {query && (
              <button
                aria-label="Clear the store search"
                className="retailer-picker-clear"
                onClick={clearQuery}
                type="button"
              >
                <X aria-hidden="true" size={15} weight="bold" />
              </button>
            )}
          </div>

          <div aria-label="Retailers" className="retailer-picker-list" id={listboxId} role="listbox">
            {showAllRow && renderOption(allOption)}
            {sections.map((section) => (
              <div
                aria-label={section.title}
                className="retailer-picker-section"
                key={section.title}
                role="group"
              >
                <p aria-hidden="true" className="retailer-picker-section-title">{section.title}</p>
                {section.options.map(renderOption)}
              </div>
            ))}
          </div>

          {options.length === 0 && (
            <p className="retailer-picker-empty">
              No stores have deals yet. Run a deals check and they will show up here.
            </p>
          )}

          {options.length > 0 && sections.length === 0 && (
            <div className="retailer-picker-empty" role="status">
              <p>No store matches “{query.trim()}”. Try a shorter name.</p>
              <button className="ghost-button" onClick={clearQuery} type="button">
                Clear search
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
