import { cva, type VariantProps } from "class-variance-authority"
import { Loader2Icon } from "lucide-react"
import React from "react"

import { cn } from "~/lib/utils"

const spinnerVariants = cva("animate-spin", {
  variants: {
    size: {
      sm: "h-4 w-4",
      default: "h-6 w-6",
      lg: "h-8 w-8",
      xl: "h-12 w-12",
    },
    variant: {
      default: "text-[var(--spinner-default-color)]",
      white: "text-[var(--spinner-white-color)]",
      gray: "text-[var(--spinner-gray-color)]",
      primary: "text-[var(--spinner-primary-color)]",
    },
  },
  defaultVariants: {
    size: "default",
    variant: "default",
  },
})

export interface SpinnerProps
  extends React.SVGProps<SVGSVGElement>,
    VariantProps<typeof spinnerVariants> {
  "aria-label"?: string
}

/**
 * Spinner renders a rotating loader icon with customizable size and color variants, and appropriate ARIA attributes for accessibility.
 */
function Spinner({ className, size, variant, ...props }: SpinnerProps) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn(spinnerVariants({ size, variant, className }))}
      {...props}
    />
  )
}

export { Spinner, spinnerVariants }
