import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import { cn } from "~/lib/utils"

const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
        destructive:
          "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
        outline:
          "border border-gray-300 dark:border-dark-bg-tertiary bg-transparent hover:bg-gray-50 dark:hover:bg-dark-bg-secondary text-gray-700 dark:text-dark-text-secondary focus:ring-gray-500",
        secondary:
          "bg-gray-200 hover:bg-gray-300 text-gray-900 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-primary dark:text-dark-text-primary focus:ring-gray-500",
        ghost:
          "bg-transparent hover:bg-gray-100 dark:hover:bg-dark-bg-secondary text-gray-700 dark:text-dark-text-secondary focus:ring-gray-500",
        success:
          "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500",
        warning:
          "bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-yellow-500",
      },
      size: {
        none: "",
        xs: "h-5 w-5 sm:h-6 sm:w-6",
        sm: "h-6 w-6 sm:h-8 sm:w-8",
        default: "h-8 w-8 sm:h-10 sm:w-10",
        lg: "h-10 w-10 sm:h-12 sm:w-12",
        xl: "h-12 w-12 sm:h-14 sm:w-14",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  loading?: boolean
  "aria-label": string
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { className, variant, size, loading, children, disabled, ...props },
    ref,
  ) => {
    const isDisabled = disabled || loading

    return (
      <button
        className={cn(iconButtonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          children
        )}
      </button>
    )
  },
)
IconButton.displayName = "IconButton"

export { IconButton, iconButtonVariants }
