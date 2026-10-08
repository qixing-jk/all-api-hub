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
        "border-border/70 bg-card/80 dark:border-foreground/10 dark:bg-foreground/[0.04] py-density-2-5 rounded-lg border px-2.5",
        className,
      )}
    >
      <div className={cn("text-muted-foreground text-xs", labelClassName)}>
        {label}
      </div>
      <div
        className={cn(
          "text-foreground mt-density-1 text-lg leading-none font-semibold",
          valueClassName,
        )}
      >
        {value}
      </div>
    </div>
  )
}
