import type { HTMLAttributes, ReactNode } from "react"

import { ActionGroup } from "~/components/ui"
import { cn } from "~/lib/utils"

interface PageActionsProps extends HTMLAttributes<HTMLDivElement> {
  primary: ReactNode
  children: ReactNode
}

/** Keeps every page action visible, wrapping naturally when space is limited. */
export function PageActions({
  primary,
  children,
  className,
  ...props
}: PageActionsProps) {
  return (
    <ActionGroup
      {...props}
      className={cn(
        "justify-start [@container(min-width:42rem)]:justify-end",
        className,
      )}
    >
      {children}
      {primary}
    </ActionGroup>
  )
}
