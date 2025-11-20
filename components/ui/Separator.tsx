import type { HTMLAttributes } from "react"

import { cn } from "~/utils/cn"

interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical"
  decorative?: boolean
}

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
        "shrink-0 bg-gray-100 dark:bg-dark-bg-tertiary",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
      {...props}
    />
  )
}
