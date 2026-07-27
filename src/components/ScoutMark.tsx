import clsx from 'clsx'
import type { CSSProperties } from 'react'

export type ScoutMotion = 'scout' | 'spin' | 'static'
export type ScoutMarkVariant = 'business' | 'consumer'

interface ScoutMarkProps {
  className?: string
  motion?: ScoutMotion
  size?: number
  variant?: ScoutMarkVariant
}

const motionClasses: Record<ScoutMotion, string> = {
  scout: 'is-scouting',
  spin: 'is-spinning',
  static: 'is-static',
}

const markSources: Record<ScoutMarkVariant, string> = {
  business: '/assets/scout-logo-business-v2.png',
  consumer: '/assets/scout-logo.png',
}

export function ScoutMark({
  className,
  motion = 'static',
  size = 38,
  variant = 'consumer',
}: ScoutMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={clsx('scout-mark', motionClasses[motion], className)}
      data-variant={variant}
      data-testid="scout-mark"
      style={{ '--scout-mark-size': `${size}px` } as CSSProperties}
    >
      <img alt="" src={markSources[variant]} />
    </span>
  )
}
