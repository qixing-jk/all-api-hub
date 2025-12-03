import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import { cn } from "~/lib/utils"

const toggleButtonVariants = cva(
  "relative inline-flex items-center justify-center rounded-md text-sm font-medium transition-all duration-200 touch-manipulation tap-highlight-transparent",
  {
    variants: {
      variant: {
        default:
          "bg-transparent hover:bg-gray-50 dark:hover:bg-dark-bg-secondary text-gray-700 dark:text-dark-text-secondary focus:ring-gray-500",
        active:
          "bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary shadow-sm scale-105 focus:ring-blue-500",
        ghost:
          "bg-transparent hover:bg-gray-100 dark:hover:bg-dark-bg-secondary text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary focus:ring-gray-500",
      },
      size: {
        sm: "px-1 py-0.5 text-xs sm:px-2 sm:py-1 sm:text-sm",
        default: "px-2 py-1 text-sm sm:px-3 sm:py-1.5 sm:text-base",
        lg: "px-4 py-2 text-base",
      },
      shape: {
        default: "rounded-md",
        pill: "rounded-full",
        square: "rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      shape: "default",
    },
  },
)

export interface ToggleButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof toggleButtonVariants> {
  isActive?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  showActiveIndicator?: boolean
  activeIndicatorColor?: string
}

const ToggleButton = React.forwardRef<HTMLButtonElement, ToggleButtonProps>(
  (
    {
      className,
      variant,
      size,
      shape,
      isActive = false,
      leftIcon,
      rightIcon,
      showActiveIndicator = false,
      activeIndicatorColor = "bg-blue-500 dark:bg-blue-400",
      children,
      ...props
    },
    ref,
  ) => {
    const buttonVariant = isActive ? "active" : variant

    return (
      <button
        className={cn(
          toggleButtonVariants({
            variant: buttonVariant,
            size,
            shape,
            className,
          }),
        )}
        ref={ref}
        aria-pressed={isActive}
        {...props}
      >
        {leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="ml-2">{rightIcon}</span>}
        {isActive && showActiveIndicator && (
          <span
            className={`absolute inset-x-0 bottom-0 h-0.5 ${activeIndicatorColor} rounded-t-sm`}
          />
        )}
      </button>
    )
  },
)
ToggleButton.displayName = "ToggleButton"

export { ToggleButton, toggleButtonVariants }
