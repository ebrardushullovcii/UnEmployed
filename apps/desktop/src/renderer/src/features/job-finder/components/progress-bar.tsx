import { useMemo, type CSSProperties } from 'react'

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

interface ProgressBarProps {
  ariaLabel?: string
  className?: string
  percent: number | null | undefined
}

export function ProgressBar({ ariaLabel = 'Progress', className, percent }: ProgressBarProps) {
  const clampedPercent = clampPercent(percent ?? 0)
  const style = useMemo(
    () => ({ ['--progress-width' as const]: `${clampedPercent}%` }) as CSSProperties,
    [clampedPercent],
  )

  return (
    <div
      aria-label={ariaLabel}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={clampedPercent}
      className={className ?? 'h-2 w-full rounded-full bg-(--surface-progress-track)'}
      role="progressbar"
    >
      <div className="progress-fill h-full bg-primary shadow-(--progress-active-glow)" style={style} />
    </div>
  )
}
