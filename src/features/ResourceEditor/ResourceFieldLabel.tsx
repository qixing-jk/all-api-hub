import type { ComponentProps } from "react"

import { Label } from "~/components/ui/label"
import { cn } from "~/lib/utils"

/** Keeps stacked editor labels six pixels above their controls, including wrapped labels. */
export function ResourceFieldLabel({
  className,
  ...props
}: ComponentProps<typeof Label>) {
  return (
    <Label
      className={cn("mb-1.5 flex w-fit max-w-full leading-5", className)}
      {...props}
    />
  )
}
