import { type ReactNode } from "react"

import Tooltip from "~/components/Tooltip"
import {
  VERIFICATION_RAIL_STATUS_VARIANTS,
  type VerificationRailStatusVariant,
} from "~/features/Verification/api/types"
import { useVerificationProbeSelection } from "~/features/Verification/api/VerificationSelectionContext"
import {
  VerificationTestIcon,
  type VerificationTestId,
} from "~/features/Verification/api/VerificationTestLabel"
import { cn } from "~/lib/utils"
import type { ApiVerificationProbeId } from "~/services/verification/aiApiVerification/types"

const RAIL_STATUS_CLASSES = {
  [VERIFICATION_RAIL_STATUS_VARIANTS.Success]: "bg-success-indicator",
  [VERIFICATION_RAIL_STATUS_VARIANTS.Danger]: "bg-destructive",
  [VERIFICATION_RAIL_STATUS_VARIANTS.Warning]: "bg-warning-indicator",
  [VERIFICATION_RAIL_STATUS_VARIANTS.Running]: "animate-pulse bg-primary",
} as const

/** Compact status indicator for the collapsed test rail. */
function renderStatusDot(variant?: VerificationRailStatusVariant) {
  if (!variant || variant === VERIFICATION_RAIL_STATUS_VARIANTS.Idle)
    return null
  return (
    <span
      data-testid={`verification-rail-status-${variant}`}
      className={cn(
        "absolute top-1 right-1 size-2 rounded-full ring-2 ring-background",
        RAIL_STATUS_CLASSES[variant],
      )}
    />
  )
}

/** Select a test from the expanded list or collapsed rail, retaining its accessible status. */
export function VerificationProbeSummary({
  id,
  probeId,
  label,
  heading,
  headingAccessory,
  status,
  statusInteractive,
  statusVariant,
  statusLabel,
  testId,
  action,
}: {
  id: string
  probeId?: ApiVerificationProbeId
  label?: string
  heading?: ReactNode
  headingAccessory?: ReactNode
  status?: ReactNode
  statusInteractive?: boolean
  statusVariant?: VerificationRailStatusVariant
  statusLabel?: string
  testId?: VerificationTestId
  action?: ReactNode
}) {
  const { selection, selected, detailCovered, isCollapsed } =
    useVerificationProbeSelection(id)
  const SummaryControl = selection ? "button" : "div"
  return (
    <>
      {isCollapsed && statusLabel ? (
        <span id={`${id}-status`} className="sr-only">
          {statusLabel}
        </span>
      ) : null}
      {isCollapsed ? (
        <div
          data-verification-summary-collapsed
          data-testid={
            probeId ? `verification-rail-item-${probeId}` : undefined
          }
          className="flex justify-center py-0.5"
        >
          <Tooltip
            content={
              statusLabel ? (
                <div className="flex flex-col gap-0.5 text-xs">
                  <span className="font-medium text-inverse-foreground">
                    {label}
                  </span>
                  <span className="text-inverse-foreground/75">
                    {statusLabel}
                  </span>
                </div>
              ) : (
                <span className="text-inverse-foreground">{label}</span>
              )
            }
            position="right"
            anchorAsChild
          >
            <button
              type="button"
              aria-label={label}
              aria-labelledby={!label ? `${id}-label` : undefined}
              aria-expanded={selection ? selected && !detailCovered : undefined}
              aria-controls={selection ? `${id}-detail` : undefined}
              aria-describedby={statusLabel ? `${id}-status` : undefined}
              onClick={selection ? () => selection.select(id) : undefined}
              className={cn(
                "relative flex size-9 items-center justify-center rounded-lg transition-colors [@container(max-width:51.999rem)]:size-11",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                selected
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <VerificationTestIcon
                testId={testId}
                className="size-4.5 shrink-0"
              />
              {renderStatusDot(statusVariant)}
            </button>
          </Tooltip>
        </div>
      ) : (
        <div
          data-verification-summary
          className={cn(
            "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-lg px-2 py-1 [@container(min-width:52rem)]:px-3",
            selection && (selected ? "bg-primary/10" : "hover:bg-muted/60"),
          )}
        >
          {heading ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <SummaryControl
                type={selection ? "button" : undefined}
                aria-label={selection ? label : undefined}
                aria-labelledby={
                  selection && !label ? `${id}-label` : undefined
                }
                aria-expanded={
                  selection ? selected && !detailCovered : undefined
                }
                aria-controls={selection ? `${id}-detail` : undefined}
                aria-describedby={
                  selection && status ? `${id}-status` : undefined
                }
                onClick={selection ? () => selection.select(id) : undefined}
                className={cn(
                  "flex min-h-5 min-w-0 items-center gap-2 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selection && "after:absolute after:inset-0",
                )}
              >
                <div id={`${id}-label`} className="min-w-0">
                  {heading}
                </div>
              </SummaryControl>
              {/* Keep help next to its label, above the selection hit area. */}
              {headingAccessory ? (
                <div className="relative z-10 flex shrink-0 items-center">
                  {headingAccessory}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="relative z-10 col-start-2 row-span-2 row-start-1 shrink-0">
            {action}
          </div>
          {status ? (
            <div
              id={`${id}-status`}
              className={cn(
                "col-start-1 row-start-2 ml-6 flex min-w-0 flex-wrap items-center gap-2",
                statusInteractive ? "relative z-10" : "pointer-events-none",
              )}
            >
              {status}
            </div>
          ) : null}
        </div>
      )}
    </>
  )
}
