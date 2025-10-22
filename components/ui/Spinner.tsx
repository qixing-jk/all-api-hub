import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import { cn } from "~/utils/cn"

const spinnerVariants = cva(
  "animate-spin rounded-full border-2 border-solid border-current border-r-transparent",
  {
    variants: {
      size: {
        sm: "h-4 w-4",
        default: "h-6 w-6",
        lg: "h-8 w-8",
        xl: "h-12 w-12"
      },
      variant: {
        default: "text-blue-600",
        white: "text-white",
        gray: "text-gray-400",
        primary: "text-gray-900 dark:text-dark-text-primary"
      }
    },
    defaultVariants: {
      size: "default",
      variant: "default"
    }
  }
)

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof spinnerVariants> {
  "aria-label"?: string
}

const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  (
    { className, size, variant, "aria-label": ariaLabel = "Loading", ...props },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(spinnerVariants({ size, variant, className }))}
        role="status"
        aria-label={ariaLabel}
        {...props}>
        <span className="sr-only">{ariaLabel}</span>
      </div>
    )
  }
)
Spinner.displayName = "Spinner"

export { Spinner, spinnerVariants }
