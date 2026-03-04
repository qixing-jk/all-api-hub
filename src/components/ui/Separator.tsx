import type { HTMLAttributes } from "react"

import { cn } from "~/lib/utils"

interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
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
      {...ariaProps}
      className={cn(
        "dark:bg-dark-bg-tertiary shrink-0 bg-gray-100",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  )
}
