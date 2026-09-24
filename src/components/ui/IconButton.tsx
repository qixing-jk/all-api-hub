import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import Tooltip, { TooltipContext } from "~/components/Tooltip"
import { useProductAnalyticsActionTracking } from "~/hooks/useProductAnalyticsActionTracking"
import { cn } from "~/lib/utils"
import type { ProductAnalyticsScopedActionConfig } from "~/services/productAnalytics/actionConfig"

const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:not-aria-busy:opacity-50 disabled:pointer-events-none ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "bg-(--button-primary-bg) text-(--button-primary-foreground) hover:bg-(--button-primary-bg-hover) focus-visible:ring-(--button-primary-ring)",
        destructive:
          "bg-(--button-destructive-bg) text-(--button-destructive-foreground) hover:bg-(--button-destructive-bg-hover) focus-visible:ring-(--button-destructive-ring)",
        destructiveGhost:
          "bg-transparent text-destructive-text hover:bg-destructive/10 focus:ring-destructive/30 dark:hover:bg-destructive/20",
        outline:
          "border border-border-strong dark:border-border bg-transparent hover:bg-surface-subtle dark:hover:bg-card text-secondary-foreground focus:ring-border-strong",
        secondary:
          "bg-secondary hover:bg-surface-strong text-foreground dark:hover:bg-background focus:ring-border-strong",
        ghost:
          "bg-transparent hover:bg-muted dark:hover:bg-card text-secondary-foreground focus:ring-border-strong",
        success:
          "bg-(--button-success-bg) text-(--button-success-foreground) hover:bg-(--button-success-bg-hover) focus-visible:ring-(--button-success-ring)",
        warning:
          "bg-(--button-warning-bg) text-(--button-warning-foreground) hover:bg-(--button-warning-bg-hover) focus-visible:ring-(--button-warning-ring)",
      },
      size: {
        none: "",
        xs: "h-(--density-control-xxs) w-(--density-control-xxs) rounded-xs sm:h-(--density-control-xs) sm:w-(--density-control-xs)",
        sm: "h-(--density-control-xs) w-(--density-control-xs) rounded-xs sm:h-(--density-control-sm) sm:w-(--density-control-sm) sm:rounded-sm",
        default:
          "h-(--density-control-sm) w-(--density-control-sm) sm:h-(--density-control) sm:w-(--density-control)",
        lg: "h-(--density-control-lg) w-(--density-control-lg)",
        xl: "h-(--density-control-xl) w-(--density-control-xl)",
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
  disableAutoTitle?: boolean
  /** Disables the default Tooltip when the caller owns the surrounding affordance. */
  disableAutoTooltip?: boolean
  /** Overrides the default Tooltip copy derived from title or aria-label. */
  tooltip?: React.ReactNode
  analyticsAction?: ProductAnalyticsScopedActionConfig
  /** Internal marker injected by Tooltip for its direct managed child. */
  "data-tooltip-anchor-id"?: string
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      variant,
      size,
      loading = false,
      children,
      disabled,
      disableAutoTitle,
      disableAutoTooltip,
      tooltip,
      analyticsAction,
      "data-tooltip-anchor-id": managedTooltipAnchorId,
      onClick,
      "aria-busy": ariaBusy,
      ...props
    },
    ref,
  ) => {
    const isDisabled = Boolean(disabled || loading)
    const analytics = useProductAnalyticsActionTracking({
      analyticsAction,
      disabled: isDisabled,
    })
    const trackingProps = analytics.getActionTrackingProps()

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      onClick?.(event)

      if (event.defaultPrevented || isDisabled || !analyticsAction) {
        return
      }

      trackingProps.onClick(event)
    }

    const hasExplicitTooltip = tooltip !== undefined && tooltip !== null
    const tooltipAnchorId = React.useContext(TooltipContext)
    const isTooltipManaged = Boolean(
      tooltipAnchorId &&
        (props.id === tooltipAnchorId ||
          managedTooltipAnchorId === tooltipAnchorId),
    )
    const shouldRenderTooltip = !disableAutoTooltip && !isTooltipManaged
    const tooltipContent = hasExplicitTooltip
      ? tooltip
      : props.title ?? props["aria-label"]
    const button = (
      <button
        className={cn(iconButtonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isDisabled}
        onClick={handleClick}
        {...props}
        aria-busy={loading ? true : ariaBusy}
        title={
          shouldRenderTooltip || isTooltipManaged
            ? undefined
            : disableAutoTitle
              ? props.title
              : props.title ?? props["aria-label"]
        }
      >
        {loading ? (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
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

    return shouldRenderTooltip ? (
      <Tooltip
        content={tooltipContent}
        anchorAsChild
        includeAccessibleDescription={hasExplicitTooltip}
      >
        {button}
      </Tooltip>
    ) : (
      button
    )
  },
)
IconButton.displayName = "IconButton"

export { IconButton, iconButtonVariants }
