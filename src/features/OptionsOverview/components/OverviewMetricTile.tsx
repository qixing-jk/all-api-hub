import type { ReactNode } from "react"

import { cn } from "~/lib/utils"

interface OverviewMetricTileProps {
  label: ReactNode
  value: ReactNode
  className?: string
  labelClassName?: string
  valueClassName?: string
}

/**
 * Shared compact label/value tile used by overview summary panels.
 */
export function OverviewMetricTile({
  label,
  value,
  className,
  labelClassName,
  valueClassName,
}: OverviewMetricTileProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200/70 bg-white/80 p-2.5 dark:border-white/10 dark:bg-white/[0.04]",
        className,
      )}
    >
      <div
        className={cn(
          "dark:text-dark-text-tertiary text-xs text-slate-500",
          labelClassName,
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-lg leading-none font-semibold text-slate-950 dark:text-white",
          valueClassName,
        )}
      >
        {value}
      </div>
    </div>
  )
}
