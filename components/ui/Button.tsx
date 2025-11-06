import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import { cn } from "~/utils/cn"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-blue-600 text-white hover:bg-blue-300 focus:ring-blue-500",
        destructive:
          "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
        outline:
          "border border-gray-300 dark:border-dark-bg-tertiary bg-transparent hover:bg-gray-50 dark:hover:bg-dark-bg-secondary text-gray-700 dark:text-dark-text-secondary focus:ring-gray-500",
        secondary:
          "bg-gray-200 hover:bg-gray-300 text-gray-900 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-primary dark:text-dark-text-primary focus:ring-gray-500",
        ghost:
          "bg-transparent hover:bg-gray-100 dark:hover:bg-dark-bg-secondary text-gray-700 dark:text-dark-text-secondary focus:ring-gray-500",
        link: "underline-offset-4 hover:underline text-blue-600 dark:text-blue-400 focus:ring-blue-500",
        success:
          "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500",
        warning:
          "bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-yellow-500"
      },
      size: {
        default: "h-8 py-1 px-3 sm:h-10 sm:py-2 sm:px-4",
        sm: "h-6 py-1 px-2 sm:h-8 sm:py-2 sm:px-3 rounded-md",
        lg: "h-9 py-2 px-6 sm:h-11 sm:py-2 sm:px-8 rounded-md",
        xl: "h-10 py-2 px-8 sm:h-12 sm:py-2 sm:px-10 rounded-lg",
        icon: "h-8 w-8 sm:h-10 sm:w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      loading,
      leftIcon,
      rightIcon,
      children,
      disabled,
      type,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isDisabled}
        type={type ?? "button"}
        {...props}>
        {loading && (
          <svg
            className="mr-2 h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24">
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
        )}
        {!loading && leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {!loading && rightIcon && <span className="ml-2">{rightIcon}</span>}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
