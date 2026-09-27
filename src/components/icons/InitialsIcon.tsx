import type { ComponentPropsWithoutRef } from "react"

import { cn } from "~/lib/utils"

export interface InitialsIconProps
  extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  /** Explicit one- or two-character monogram chosen by the caller. */
  initials: string
}

/**
 * Renders a compact, neutral monogram that follows the caller's icon sizing.
 */
export function InitialsIcon({
  initials,
  className,
  ...props
}: InitialsIconProps) {
  const fontSizeClassName = initials.length === 1 ? "text-[9px]" : "text-[8px]"

  return (
    <span
      {...props}
      className={cn(
        "bg-secondary inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-sm leading-none font-semibold tracking-tight select-none",
        fontSizeClassName,
        className,
      )}
    >
      {initials}
    </span>
  )
}
