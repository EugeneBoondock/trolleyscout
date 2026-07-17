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
      <img alt="" src="/assets/brand-mark.png" />
      <svg focusable="false" viewBox="0 0 512 512">
        <g className="scout-mark-cover">
          <path d="M188 280 229 187 265 199 284 235 249 222Z" />
          <path d="m226 188 111-68-54 118-36-14Z" />
          <circle cx="256" cy="211" r="27" />
        </g>
        <g className="scout-mark-needle" data-testid="scout-mark-needle">
          <path className="scout-mark-needle-tail" d="m256 211-62 62 45-80Z" />
          <path className="scout-mark-needle-head" d="m256 211 73-81-56 102Z" />
          <circle className="scout-mark-hub" cx="256" cy="211" r="22" />
          <circle className="scout-mark-hub-centre" cx="256" cy="211" r="11" />
        </g>
      </svg>
    </span>
  )
}
