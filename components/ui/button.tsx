import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "~/lib/utils"

import { Spinner } from "./Spinner"

const buttonVariants = cva(
  "relative inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--button-primary-bg)] text-[var(--button-primary-foreground)] shadow hover:bg-[var(--button-primary-bg-hover)] focus-visible:ring-[var(--button-primary-ring)] focus-visible:ring-opacity-40",
        destructive:
          "bg-[var(--button-destructive-bg)] text-[var(--button-destructive-foreground)] shadow-sm hover:bg-[var(--button-destructive-bg-hover)] focus-visible:ring-[var(--button-destructive-ring)] focus-visible:ring-opacity-40",
        outline:
          "border border-[var(--button-outline-border)] bg-[var(--button-outline-bg)] shadow-xs text-[var(--button-outline-foreground)] hover:bg-[var(--button-outline-hover-bg)] focus-visible:ring-[var(--button-outline-ring)] focus-visible:ring-opacity-40",
        secondary:
          "bg-[var(--button-secondary-bg)] text-[var(--button-secondary-foreground)] shadow-sm hover:bg-[var(--button-secondary-bg-hover)] focus-visible:ring-[var(--button-secondary-ring)] focus-visible:ring-opacity-40",
        success:
          "bg-[var(--button-success-bg)] text-[var(--button-success-foreground)] shadow-sm hover:bg-[var(--button-success-bg-hover)] focus-visible:ring-[var(--button-success-ring)] focus-visible:ring-opacity-40",
        warning:
          "bg-[var(--button-warning-bg)] text-[var(--button-warning-foreground)] shadow-sm hover:bg-[var(--button-warning-bg-hover)] focus-visible:ring-[var(--button-warning-ring)] focus-visible:ring-opacity-40",
        ghost:
          "text-[var(--button-ghost-foreground)] hover:bg-[var(--button-ghost-hover-bg)] hover:text-[var(--button-ghost-hover-foreground)]",
        link: "text-[var(--button-link-foreground)] underline-offset-4 hover:text-[var(--button-link-hover-foreground)] hover:underline focus-visible:ring-[var(--button-link-ring)] focus-visible:ring-opacity-40",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3",
        lg: "h-10 rounded-md px-6",
        icon: "h-9 w-9",
      },
      bleed: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      bleed: false,
    },
  },
)

function Button({
  className,
  variant,
  size,
  bleed,
  asChild = false,
  loading = false,
  leftIcon,
  rightIcon,
  spinnerProps,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    bleed?: boolean
    loading?: boolean
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
    spinnerProps?: React.ComponentProps<typeof Spinner>
  }) {
  const Comp = asChild ? Slot : "button"
  const iconClass =
    "inline-flex items-center text-current [&>svg]:size-4 [&>svg]:shrink-0"
  const {
    size: spinnerSizeProp,
    variant: spinnerVariantProp,
    ...restSpinnerProps
  } = spinnerProps ?? {}
  const resolvedSpinnerVariant =
    spinnerVariantProp ??
    (variant === "default" ||
    variant === "destructive" ||
    variant === "secondary" ||
    variant === "success" ||
    variant === "warning"
      ? "white"
      : "primary")
  const resolvedSpinnerSize = spinnerSizeProp ?? "sm"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, bleed, className }))}
      {...props}
    >
      {loading && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Spinner
            size={resolvedSpinnerSize}
            variant={resolvedSpinnerVariant}
            {...restSpinnerProps}
          />
        </span>
      )}
      <span
        className={cn("flex items-center gap-2", loading && "opacity-0")}
        aria-live={loading ? "polite" : undefined}
      >
        {leftIcon && <span className={iconClass}>{leftIcon}</span>}
        <span className="truncate">{children}</span>
        {rightIcon && <span className={iconClass}>{rightIcon}</span>}
      </span>
    </Comp>
  )
}

export { Button, buttonVariants }
