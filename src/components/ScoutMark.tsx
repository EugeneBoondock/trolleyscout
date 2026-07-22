import clsx from 'clsx'
import type { CSSProperties } from 'react'

export type ScoutMotion = 'scout' | 'spin' | 'static'

interface ScoutMarkProps {
  className?: string
  motion?: ScoutMotion
  size?: number
}

const motionClasses: Record<ScoutMotion, string> = {
  scout: 'is-scouting',
  spin: 'is-spinning',
  static: 'is-static',
}

export function ScoutMark({ className, motion = 'static', size = 38 }: ScoutMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={clsx('scout-mark', motionClasses[motion], className)}
      data-testid="scout-mark"
      style={{ '--scout-mark-size': `${size}px` } as CSSProperties}
    >
      <img alt="" src="/assets/scout-logo.png" />
    </span>
  )
}
