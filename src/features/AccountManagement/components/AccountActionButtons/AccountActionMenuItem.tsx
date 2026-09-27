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
   * - `success`: reserved for confirmed positive feedback, not ordinary actions.
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
  /** Whether selecting the item should close its dropdown menu. */
  closeOnSelect?: boolean
}

const menuItemLayoutClassName =
  "flex w-full gap-density-2 px-3 py-density-2 text-left text-sm"
const menuItemClassName = `${menuItemLayoutClassName} items-start text-secondary-foreground hover:text-foreground data-[highlighted]:bg-surface-subtle dark:data-[highlighted]:bg-secondary`
const warningMenuItemClassName = `${menuItemLayoutClassName} items-start text-warning-text hover:text-warning-text data-[highlighted]:bg-warning-soft`
const successMenuItemClassName = `${menuItemLayoutClassName} items-start text-success-text hover:text-success-text data-[highlighted]:bg-success-soft`
const destructiveMenuItemClassName = `${menuItemLayoutClassName} items-start text-destructive-text hover:text-destructive-text data-[highlighted]:bg-destructive-soft`
const disabledMenuItemClassName = `${menuItemLayoutClassName} items-center text-faint-foreground dark:text-muted-foreground cursor-not-allowed`

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
  closeOnSelect = true,
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
      onSelect={(event) => {
        if (!closeOnSelect) event.preventDefault()
      }}
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
          <span className="gap-density-2 flex min-w-0 items-center">
            <span className="min-w-0 break-words whitespace-normal">
              {resolvedLabel}
            </span>
            {hint ? (
              <span
                className="border-border-strong text-muted-foreground text-2xs shrink-0 rounded-full border px-1.5 py-0.5 leading-none font-medium"
                aria-hidden="true"
              >
                {hint}
              </span>
            ) : null}
          </span>
          {description && !hint ? (
            <span
              id={descriptionId}
              className="text-muted-foreground mt-0.5 block text-xs break-words whitespace-normal"
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
