import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import { cn } from "~/lib/utils"

const toggleButtonVariants = cva(
  "relative inline-flex items-center justify-center rounded-md text-sm font-medium transition-all duration-200 touch-manipulation tap-highlight-transparent",
  {
    variants: {
      variant: {
        default:
          "bg-transparent hover:bg-surface-subtle dark:hover:bg-card text-secondary-foreground focus:ring-border-strong",
        active: "bg-card text-foreground shadow-sm scale-105 focus:ring-ring",
        ghost:
          "bg-transparent hover:bg-muted dark:hover:bg-card text-muted-foreground dark:text-secondary-foreground hover:text-foreground focus:ring-border-strong",
      },
      size: {
        sm: "px-1 py-0.5 text-xs sm:px-2 sm:py-density-1 sm:text-sm",
        default: "px-2 py-density-1 sm:px-3 sm:py-density-1-5",
        lg: "px-4 py-density-2 text-base",
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
      activeIndicatorColor = "bg-theme-500 dark:bg-theme-400",
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
            className={`absolute inset-x-2 bottom-0 h-0.5 ${activeIndicatorColor} rounded-full`}
          />
        )}
      </button>
    )
  },
)
ToggleButton.displayName = "ToggleButton"

export { ToggleButton, toggleButtonVariants }
