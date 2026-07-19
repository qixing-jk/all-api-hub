import React from "react"

import { DropdownMenuItem } from "~/components/ui/dropdown-menu"
import { Spinner } from "~/components/ui/spinner"
import { useProductAnalyticsActionTracking } from "~/hooks/useProductAnalyticsActionTracking"
import type { ProductAnalyticsScopedActionConfig } from "~/services/productAnalytics/actionConfig"

interface AccountActionMenuItemProps {
  /** Click handler; receives the original click event (after propagation is stopped). */
  onClick: (e?: React.MouseEvent) => void
  /** Leading icon rendered to the left of the label. */
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  /** Visible label (also used by tests as the accessible name). */
  label: string
  /** Optional full description exposed to hover/focus assistive text. */
  description?: string
  /** Optional compact visible hint for disabled informational states. */
  hint?: string
  /** Uses the destructive (red) palette. Prefer over `tone` when applicable. */
  isDestructive?: boolean
  /**
   * Non-destructive semantic tone for the menu item.
   * - `warning`: used for reversible, potentially risky actions (e.g., Disable).
   * - `success`: used for recovery/positive actions (e.g., Enable).
   */
  tone?: "default" | "warning" | "success"
  /** Disables the item and renders it with the disabled palette. */
  disabled?: boolean
  /** Shows a spinner and disables the item while its action is pending. */
  loading?: boolean
  /** Visible and accessible label used while the action is pending. */
  loadingLabel?: string
  /** Fixed analytics identifiers emitted for explicitly tracked menu actions. */
  analyticsAction?: ProductAnalyticsScopedActionConfig
  /** Optional stable selector for E2E action targeting. */
  testId?: string
}

const menuItemClassName =
  "flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:text-gray-900 data-[highlighted]:bg-gray-50 dark:text-dark-text-secondary dark:hover:text-dark-text-primary dark:data-[highlighted]:bg-dark-bg-tertiary"
const warningMenuItemClassName =
  "flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-amber-600 hover:text-amber-700 data-[highlighted]:bg-amber-50 dark:text-amber-400 dark:hover:text-amber-300 dark:data-[highlighted]:bg-amber-900/40"
const successMenuItemClassName =
  "flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-emerald-600 hover:text-emerald-700 data-[highlighted]:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:data-[highlighted]:bg-emerald-900/40"
const destructiveMenuItemClassName =
  "flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-red-600 hover:text-red-700 data-[highlighted]:bg-red-50 dark:data-[highlighted]:bg-red-900/50"
const disabledMenuItemClassName =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-400 dark:text-dark-text-tertiary cursor-not-allowed"

export const AccountActionMenuItem: React.FC<AccountActionMenuItemProps> = ({
  onClick,
  icon: Icon,
  label,
  description,
  hint,
  isDestructive = false,
  tone = "default",
  disabled = false,
  loading = false,
  loadingLabel,
  analyticsAction,
  testId,
}) => {
  const descriptionId = React.useId()
  const isMenuItemDisabled = disabled || loading
  const resolvedLabel = loading ? loadingLabel ?? label : label
  const analytics = useProductAnalyticsActionTracking({
    analyticsAction,
    disabled: isMenuItemDisabled,
  })
  const trackingProps = analytics.getActionTrackingProps()

  return (
    <DropdownMenuItem
      asChild
      disabled={isMenuItemDisabled}
      className={
        isMenuItemDisabled
          ? disabledMenuItemClassName
          : isDestructive
            ? destructiveMenuItemClassName
            : tone === "warning"
              ? warningMenuItemClassName
              : tone === "success"
                ? successMenuItemClassName
                : menuItemClassName
      }
    >
      <button
        type="button"
        aria-label={resolvedLabel}
        aria-busy={loading ? true : undefined}
        aria-describedby={description ? descriptionId : undefined}
        data-testid={testId}
        title={description ?? hint}
        onClick={(e) => {
          e.stopPropagation()
          if (isMenuItemDisabled) return
          onClick(e)
          trackingProps.onClick(e)
        }}
        disabled={isMenuItemDisabled}
      >
        {loading ? (
          <Spinner aria-hidden="true" size="sm" className="mt-0.5 shrink-0" />
        ) : (
          <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{resolvedLabel}</span>
            {hint ? (
              <span
                className="dark:border-dark-bg-quaternary dark:text-dark-text-tertiary shrink-0 rounded-full border border-gray-300 px-1.5 py-0.5 text-[11px] leading-none font-medium text-gray-500"
                aria-hidden="true"
              >
                {hint}
              </span>
            ) : null}
          </span>
          {description && !hint ? (
            <span
              id={descriptionId}
              className="dark:text-dark-text-tertiary mt-0.5 block text-xs break-words whitespace-normal text-gray-500"
            >
              {description}
            </span>
          ) : null}
          {description && hint ? (
            <span id={descriptionId} className="sr-only">
              {description}
            </span>
          ) : null}
        </span>
      </button>
    </DropdownMenuItem>
  )
}
