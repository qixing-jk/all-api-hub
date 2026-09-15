import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import * as React from "react"

import { cn } from "~/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-3 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft-hover",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive-soft text-destructive-soft-foreground hover:bg-destructive-soft-hover",
        outline: "text-foreground hover:bg-accent hover:text-accent-foreground",
        success:
          "border-transparent bg-success-soft text-success-soft-foreground hover:bg-success-soft-hover",
        warning:
          "border-transparent bg-warning-soft text-warning-soft-foreground hover:bg-warning-soft-hover",
        info: "border-transparent bg-info-soft text-info-soft-foreground hover:bg-info-soft-hover",
        danger:
          "border-transparent bg-destructive-soft text-destructive-soft-foreground hover:bg-destructive-soft-hover",
      },
      size: {
        default: "text-xs px-2.5 py-0.5",
        sm: "text-[0.65rem] px-2 py-0.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

/**
 * Badge renders a pill-style label with color and size variants for status or metadata.
 */
function Badge({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

/**
 * BadgeAdornment renders short secondary metadata inside a Badge.
 */
function BadgeAdornment({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="badge-adornment"
      className={cn(
        "shrink-0 rounded-full bg-current/10 px-1.5 text-[0.85em] font-medium tabular-nums",
        className,
      )}
      {...props}
    />
  )
}

export { Badge, BadgeAdornment, badgeVariants }
