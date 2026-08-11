import { Progress as ProgressPrimitive } from "radix-ui"
import * as React from "react"

import { cn } from "~/lib/utils"

export interface ProgressProps
  extends React.ComponentProps<typeof ProgressPrimitive.Root> {
  indicatorClassName?: string
}

/** Renders an accessible progress indicator with bounded value semantics. */
function Progress({
  className,
  indicatorClassName,
  max = 100,
  value = 0,
  ...props
}: ProgressProps) {
  const normalizedMax = Number.isFinite(max) && max > 0 ? max : 100
  const normalizedValue = Math.min(Math.max(value ?? 0, 0), normalizedMax)
  const percentage = (normalizedValue / normalizedMax) * 100

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className,
      )}
      max={normalizedMax}
      value={normalizedValue}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "bg-primary h-full w-full flex-1 transition-transform",
          indicatorClassName,
        )}
        style={{ transform: `translateX(-${100 - percentage}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
