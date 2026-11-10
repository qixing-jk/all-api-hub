import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import * as React from "react"

import { cn } from "~/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-x-1 gap-y-density-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-3 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary-soft text-primary-soft-foreground [&:is(a[href],button,[role=button])]:hover:bg-primary-soft-hover",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [&:is(a[href],button,[role=button])]:hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive-soft text-destructive-soft-foreground [&:is(a[href],button,[role=button])]:hover:bg-destructive-soft-hover",
        ghost:
          "border-transparent [&:is(a[href],button,[role=button])]:hover:bg-accent [&:is(a[href],button,[role=button])]:hover:text-accent-foreground",
        link: "border-transparent text-link underline-offset-4 [&:is(a[href],button,[role=button])]:hover:underline",
        outline:
          "text-foreground [&:is(a[href],button,[role=button])]:hover:bg-accent [&:is(a[href],button,[role=button])]:hover:text-accent-foreground",
        success:
          "border-transparent bg-success-soft text-success-soft-foreground [&:is(a[href],button,[role=button])]:hover:bg-success-soft-hover",
        warning:
          "border-transparent bg-warning-soft text-warning-soft-foreground [&:is(a[href],button,[role=button])]:hover:bg-warning-soft-hover",
        info: "border-transparent bg-info-soft text-info-soft-foreground [&:is(a[href],button,[role=button])]:hover:bg-info-soft-hover",
        danger:
          "border-transparent bg-destructive-soft text-destructive-soft-foreground [&:is(a[href],button,[role=button])]:hover:bg-destructive-soft-hover",
      },
      size: {
        default: "text-xs px-2.5 py-0.5",
        sm: "text-[length:calc(0.65rem+var(--text-size-increment))] leading-normal px-2 py-0.5",
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
      data-variant={variant ?? "default"}
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
