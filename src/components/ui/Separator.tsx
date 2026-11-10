import type { ComponentProps } from "react"

import { cn } from "~/lib/utils"

interface SeparatorProps extends ComponentProps<"div"> {
  orientation?: "horizontal" | "vertical"
  decorative?: boolean
}

/**
 * Separator renders a horizontal or vertical line with optional decorative role.
 */
export function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  role,
  ...props
}: SeparatorProps) {
  const ariaProps = decorative
    ? { role: role ?? "none" }
    : { role: role ?? "separator", "aria-orientation": orientation }

  return (
    <div
      data-slot="separator"
      data-orientation={orientation}
      {...ariaProps}
      className={cn(
        "shrink-0 bg-muted dark:bg-secondary",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  )
}
