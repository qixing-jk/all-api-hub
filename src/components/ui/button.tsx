import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import * as React from "react"

import { Spinner } from "~/components/ui/spinner"
import { useProductAnalyticsActionTracking } from "~/hooks/useProductAnalyticsActionTracking"
import { cn } from "~/lib/utils"
import type { ProductAnalyticsScopedActionConfig } from "~/services/productAnalytics/actionConfig"

type SlottedChildProps = React.AriaAttributes & {
  disabled?: boolean
  onClick?: React.MouseEventHandler<HTMLElement>
  tabIndex?: number
}

const buttonVariants = cva(
  "inline-flex min-w-0 max-w-full shrink items-center justify-center gap-x-2 gap-y-density-2 rounded-md text-center text-sm font-medium whitespace-normal break-words transition-[background-color,border-color,color,box-shadow,opacity] duration-150 ease-out motion-reduce:transition-none disabled:pointer-events-none disabled:not-aria-busy:opacity-50 aria-disabled:pointer-events-none aria-disabled:not-aria-busy:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-(--button-primary-bg) text-(--button-primary-foreground) shadow hover:bg-(--button-primary-bg-hover) focus-visible:ring-(--button-primary-ring) focus-visible:ring-opacity-40",
        destructive:
          "bg-(--button-destructive-bg) text-(--button-destructive-foreground) hover:bg-(--button-destructive-bg-hover) focus-visible:ring-(--button-destructive-ring)",
        outline:
          "border border-(--button-outline-border) bg-(--button-outline-bg) text-(--button-outline-foreground) shadow-xs hover:bg-(--button-outline-hover-bg) focus-visible:ring-(--button-outline-ring)",
        dashed:
          "border border-input border-dashed bg-transparent text-muted-foreground shadow-none hover:border-primary/50 hover:bg-accent hover:text-foreground dark:hover:bg-accent/50",
        secondary:
          "border bg-(--button-secondary-bg) text-(--button-secondary-foreground) hover:bg-(--button-secondary-bg-hover) focus-visible:ring-(--button-secondary-ring)",
        success:
          "bg-(--button-success-bg) text-(--button-success-foreground) shadow-sm hover:bg-(--button-success-bg-hover) focus-visible:ring-(--button-success-ring) focus-visible:ring-opacity-40",
        warning:
          "bg-(--button-warning-bg) text-(--button-warning-foreground) shadow-sm hover:bg-(--button-warning-bg-hover) focus-visible:ring-(--button-warning-ring) focus-visible:ring-opacity-40",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-(--button-link-foreground) underline-offset-4 hover:text-(--button-link-hover-foreground) hover:underline focus-visible:ring-(--button-link-ring)",
      },
      size: {
        // Intrinsic min-height does not grow a fixed-height button in older
        // Chromium. Let content determine height and use the size as a floor.
        default:
          "h-auto min-h-(--density-control) px-4 py-density-1-5 has-[>svg]:px-3",
        sm: "h-auto min-h-(--density-control-sm) gap-x-1.5 gap-y-density-1-5 rounded-sm px-3 py-density-1 has-[>svg]:px-2.5",
        lg: "h-auto min-h-(--density-control-lg) rounded-md px-6 py-density-2 has-[>svg]:px-4",
        icon: "size-(--density-control) max-w-none shrink-0 whitespace-nowrap",
        "icon-xs":
          "size-(--density-control-xs) max-w-none shrink-0 rounded-xs whitespace-nowrap [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-(--density-control-sm) max-w-none shrink-0 rounded-sm whitespace-nowrap",
        "icon-lg":
          "size-(--density-control-lg) max-w-none shrink-0 whitespace-nowrap",
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

export const BUTTON_LOADING_BEHAVIORS = {
  Disabled: "disabled",
  Interactive: "interactive",
} as const

export type ButtonLoadingBehavior =
  (typeof BUTTON_LOADING_BEHAVIORS)[keyof typeof BUTTON_LOADING_BEHAVIORS]

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
  loadingBehavior = BUTTON_LOADING_BEHAVIORS.Disabled,
  leftIcon,
  rightIcon,
  children,
  spinnerProps,
  analyticsAction,
  onClick,
  disabled,
  "aria-busy": ariaBusy,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    bleed?: boolean
    loading?: boolean
    /** Keeps a loading button actionable for state-changing actions such as cancel or stop. */
    loadingBehavior?: ButtonLoadingBehavior
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
    spinnerProps?: React.ComponentProps<typeof Spinner>
    analyticsAction?: ProductAnalyticsScopedActionConfig
  }) {
  const Comp = asChild ? Slot.Root : "button"
  const isDisabled = Boolean(
    disabled ||
      (loading && loadingBehavior === BUTTON_LOADING_BEHAVIORS.Disabled),
  )
  const resolvedSize = size ?? "default"
  const analytics = useProductAnalyticsActionTracking({
    analyticsAction,
    disabled: isDisabled,
  })
  const trackingProps = analytics.getActionTrackingProps()

  const {
    size: spinnerSizeProp,
    variant: spinnerVariantProp,
    ...restSpinnerProps
  } = spinnerProps ?? {}
  // Follow the button's own foreground: the resolved --spinner-primary-color is
  // --primary, which is also --button-primary-bg, so the default would paint the
  // icon the same colour as a solid button's background.
  const resolvedSpinnerVariant = spinnerVariantProp ?? "current"
  const resolvedSpinnerSize = spinnerSizeProp ?? "sm"
  const resolvedLeftIcon = loading ? (
    <Spinner
      size={resolvedSpinnerSize}
      variant={resolvedSpinnerVariant}
      {...restSpinnerProps}
      aria-hidden="true"
    />
  ) : (
    leftIcon
  )
  const resolvedChildren =
    asChild && isDisabled && React.isValidElement<SlottedChildProps>(children)
      ? React.cloneElement(children, {
          ...(loading ? { "aria-busy": true } : {}),
          "aria-disabled": true,
          ...(children.type === "button" ? { disabled: true } : {}),
          onClick: (event) => {
            event.preventDefault()
            event.stopPropagation()
          },
          tabIndex: -1,
        })
      : children
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (isDisabled) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    onClick?.(event)

    if (event.defaultPrevented || !analyticsAction) {
      return
    }

    trackingProps.onClick(event)
  }

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, bleed, className }))}
      disabled={asChild ? undefined : isDisabled}
      onClick={handleClick}
      {...props}
      data-size={resolvedSize}
      aria-busy={loading ? true : ariaBusy}
    >
      {resolvedLeftIcon && <span>{resolvedLeftIcon}</span>}
      <Slot.Slottable>{resolvedChildren}</Slot.Slottable>
      {rightIcon && <span>{rightIcon}</span>}
    </Comp>
  )
}

export { Button, buttonVariants }
