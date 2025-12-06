import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { Spinner } from "~/components/ui/Spinner"
import { cn } from "~/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--button-primary-bg)] text-[var(--button-primary-foreground)] shadow hover:bg-[var(--button-primary-bg-hover)] focus-visible:ring-[var(--button-primary-ring)] focus-visible:ring-opacity-40",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        success:
          "bg-[var(--button-success-bg)] text-[var(--button-success-foreground)] shadow-sm hover:bg-[var(--button-success-bg-hover)] focus-visible:ring-[var(--button-success-ring)] focus-visible:ring-opacity-40",
        warning:
          "bg-[var(--button-warning-bg)] text-[var(--button-warning-foreground)] shadow-sm hover:bg-[var(--button-warning-bg-hover)] focus-visible:ring-[var(--button-warning-ring)] focus-visible:ring-opacity-40",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
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

/**
 * Button renders a styled Radix-aware button with variants, sizes, icons, and optional loading spinner.
 */
function Button({
  className,
  variant,
  size,
  bleed,
  asChild = false,
  loading = false,
  leftIcon,
  rightIcon,
  children,
  spinnerProps,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    bleed?: boolean
    loading?: boolean
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
    spinnerProps?: React.ComponentProps<typeof Spinner>
  }) {
  const Comp = asChild ? Slot : "button"

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
        <span className="pointer-events-none">
          <Spinner
            size={resolvedSpinnerSize}
            variant={resolvedSpinnerVariant}
            {...restSpinnerProps}
          />
        </span>
      )}
      <>
        {leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="ml-2">{rightIcon}</span>}
      </>
    </Comp>
  )
}

export { Button, buttonVariants }
