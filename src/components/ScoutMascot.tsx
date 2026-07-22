import { X } from '@phosphor-icons/react'
import clsx from 'clsx'
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'

export type ScoutMascotPose = 'point' | 'search' | 'wave'

interface ScoutMascotProps {
  className?: string
  label?: string
  pose?: ScoutMascotPose
  size?: number
}

const posePaths: Record<ScoutMascotPose, string> = {
  point: '/mascots/scout-point.png',
  search: '/mascots/scout-search.png',
  wave: '/mascots/scout-wave.png',
}

export function ScoutMascot({
  className,
  label,
  pose = 'wave',
  size = 148,
}: ScoutMascotProps) {
  return (
    <span
      className={clsx('scout-mascot', `is-${pose}`, className)}
      style={{ '--scout-mascot-size': `${size}px` } as CSSProperties}
    >
      <img alt={label ?? ''} src={posePaths[pose]} />
    </span>
  )
}

interface ScoutTip {
  message: string
  pose: ScoutMascotPose
  title: string
}

const scoutTips: Record<string, ScoutTip> = {
  dashboard: {
    message: 'Your saved deals, basket, nearby stores, and alerts are all within reach from here.',
    pose: 'wave',
    title: 'Welcome back',
  },
  discovery: {
    message: 'Open Advanced to narrow deals by retailer, source, images, and savings.',
    pose: 'search',
    title: 'A quicker deal search',
  },
  home: {
    message: 'Start with Deals when you know what you need, or Near me when you want local options.',
    pose: 'wave',
    title: 'Meet Scout',
  },
  near: {
    message: 'Share your location for nearby stores and listings, then tighten the radius for closer results.',
    pose: 'point',
    title: 'Keep it local',
  },
  properties: {
    message: 'Begin with your suburb and a tight radius. Widen it only when you want more options.',
    pose: 'search',
    title: 'Search your suburb first',
  },
  sources: {
    message: 'Open a store card to see its current deals and catalogues on one curated page.',
    pose: 'point',
    title: 'Stores are easier now',
  },
  tools: {
    message: 'Choose your stores first, then search one product across every selected retailer.',
    pose: 'search',
    title: 'Compare like for like',
  },
}

export function ScoutGuide({ delayMs = 650, view }: { delayMs?: number; view: string }) {
  const [visible, setVisible] = useState(false)
  const tip = scoutTips[view]

  useEffect(() => {
    setVisible(false)
    if (!tip) return

    const storageKey = `trolley-scout-guide:${view}`
    if (window.sessionStorage.getItem(storageKey)) return

    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem(storageKey, 'seen')
      setVisible(true)
    }, delayMs)

    return () => window.clearTimeout(timer)
  }, [delayMs, tip, view])

  if (!tip || !visible) return null

  return (
    <aside aria-live="polite" className="scout-guide" role="status">
      <ScoutMascot pose={tip.pose} size={108} />
      <div className="scout-guide-copy">
        <strong>{tip.title}</strong>
        <p>{tip.message}</p>
      </div>
      <button aria-label="Dismiss Scout’s tip" onClick={() => setVisible(false)} type="button">
        <X aria-hidden="true" size={16} weight="bold" />
      </button>
    </aside>
  )
}
