import { Slot, Slottable } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { Spinner } from "~/components/ui"
import { cn } from "~/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-(--button-primary-bg) text-(--button-primary-foreground) shadow hover:bg-(--button-primary-bg-hover) focus-visible:ring-(--button-primary-ring) focus-visible:ring-opacity-40",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "border bg-secondary text-secondary-foreground hover:bg-secondary/80",
        success:
          "bg-(--button-success-bg) text-(--button-success-foreground) shadow-sm hover:bg-(--button-success-bg-hover) focus-visible:ring-(--button-success-ring) focus-visible:ring-opacity-40",
        warning:
          "bg-(--button-warning-bg) text-(--button-warning-foreground) shadow-sm hover:bg-(--button-warning-bg-hover) focus-visible:ring-(--button-warning-ring) focus-visible:ring-opacity-40",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-(--button-link-foreground) underline-offset-4 hover:text-(--button-link-hover-foreground) hover:underline focus-visible:ring-(--button-link-ring)",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
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
 * Button renders a styled Radix-aware button with variants, sizes, icons, and optional loading spinner
 * (replacing the left icon while loading).
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
  const resolvedSpinnerVariant = spinnerVariantProp ?? "primary"
  const resolvedSpinnerSize = spinnerSizeProp ?? "sm"
  const resolvedLeftIcon = loading ? (
    <Spinner
      size={resolvedSpinnerSize}
      variant={resolvedSpinnerVariant}
      {...restSpinnerProps}
    />
  ) : (
    leftIcon
  )

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, bleed, className }))}
      {...props}
    >
      {resolvedLeftIcon && <span>{resolvedLeftIcon}</span>}
      <Slottable>{children}</Slottable>
      {rightIcon && <span>{rightIcon}</span>}
    </Comp>
  )
}

export { Button, buttonVariants }
