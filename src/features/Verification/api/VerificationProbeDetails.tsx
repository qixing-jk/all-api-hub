import { useContext, useEffect, useId, type ReactNode } from "react"

import { Heading6 } from "~/components/ui"
import type { VerificationToolsController } from "~/features/Verification/api/useVerificationTools"
import { VerificationSelectionContext } from "~/features/Verification/api/VerificationSelectionContext"
import { cn } from "~/lib/utils"
import type { ApiVerificationProbeId } from "~/services/verification/aiApiVerification/types"

import {
  VerificationProbeResult,
  type ProbeDetailsResult,
} from "./VerificationProbeResult"
import { VerificationPromptSettings } from "./VerificationPromptSettings"

/** Keeps a test's editable configuration separate from the evidence of its last run. */
export function VerificationProbeDetails({
  controller,
  probeId,
  result,
  label,
  heading,
  headingAccessory,
  description,
  resultSummary,
  status,
  statusInteractive = false,
  action,
  children,
  detailsContent,
  idleContent,
  defaultDetailsOpen = true,
}: {
  label?: string
  heading?: ReactNode
  headingAccessory?: ReactNode
  description?: ReactNode
  resultSummary?: ReactNode
  status?: ReactNode
  statusInteractive?: boolean
  action?: ReactNode
  children?: ReactNode
  detailsContent?: ReactNode
  idleContent?: ReactNode
  defaultDetailsOpen?: boolean
  controller?: VerificationToolsController
  probeId?: ApiVerificationProbeId
  result?: ProbeDetailsResult | null
}) {
  const id = useId()
  const selection = useContext(VerificationSelectionContext)
  const register = selection?.register
  useEffect(() => register?.(id), [register, id])
  const selected = !selection || selection.selectedId === id
  const SummaryControl = selection ? "button" : "div"
  const separateStatus = Boolean(headingAccessory || statusInteractive)
  const hasResult = Boolean(result || detailsContent || resultSummary)
  const hasPrompt =
    controller && probeId && controller.promptIds.includes(probeId)
  if (!heading && !action && !hasPrompt && !hasResult) return null
  return (
    <div
      data-verification-probe={probeId}
      data-testid={probeId ? `verification-prompt-${probeId}` : undefined}
    >
      <div
        data-verification-summary
        className={cn(
          "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 [@container(min-width:52rem)]:px-3 [@container(min-width:52rem)]:py-2",
          selection && (selected ? "bg-primary/10" : "hover:bg-muted/60"),
        )}
      >
        <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          {heading ? (
            <SummaryControl
              type={selection ? "button" : undefined}
              aria-label={selection ? label : undefined}
              aria-labelledby={selection && !label ? `${id}-label` : undefined}
              aria-expanded={selection ? selected : undefined}
              aria-controls={selection ? `${id}-detail` : undefined}
              aria-describedby={
                selection && status ? `${id}-status` : undefined
              }
              onClick={selection ? () => selection.select(id) : undefined}
              className={cn(
                "focus-visible:ring-ring flex min-h-(--density-control-sm) min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none",
                separateStatus
                  ? selection && "after:absolute after:inset-0"
                  : "flex-1",
              )}
            >
              <div id={`${id}-label`}>{heading}</div>
              {!separateStatus && status ? (
                <div
                  id={`${id}-status`}
                  className="flex flex-wrap items-center gap-2"
                >
                  {status}
                </div>
              ) : null}
            </SummaryControl>
          ) : null}
          {separateStatus ? (
            <>
              {/* Keep help above the selection hit area without nesting buttons. */}
              {headingAccessory ? (
                <div className="relative z-10 flex shrink-0 items-center">
                  {headingAccessory}
                </div>
              ) : null}
              {status ? (
                <div
                  id={`${id}-status`}
                  className={cn(
                    "flex flex-wrap items-center gap-2",
                    statusInteractive ? "relative z-10" : "pointer-events-none",
                  )}
                >
                  {status}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      {/* Keep each detail mounted in its row. CSS moves it to the desktop pane;
          selection and resizing must not reset editors, results or requests. */}
      <div
        id={`${id}-detail`}
        hidden={!selected}
        data-verification-detail
        className={cn(
          "min-w-0 [@container(min-width:52rem)]:[&_:is(pre,textarea,ol)]:max-h-none",
          selection &&
            "bg-surface-subtle my-1 rounded-lg p-3 [@container(min-width:52rem)]:absolute [@container(min-width:52rem)]:inset-y-0 [@container(min-width:52rem)]:right-0 [@container(min-width:52rem)]:left-[calc(var(--verification-list-width)+1.25rem)] [@container(min-width:52rem)]:my-0 [@container(min-width:52rem)]:overflow-y-auto [@container(min-width:52rem)]:rounded-xl [@container(min-width:52rem)]:p-5",
        )}
      >
        <div
          data-verification-detail-content
          className={cn(
            idleContent
              ? "gap-density-2 [@container(min-width:52rem)]:gap-density-3 flex flex-col [@container(min-width:52rem)]:h-full [@container(min-width:52rem)]:[&>*:not(:last-child)]:shrink-0"
              : "space-y-density-2 [@container(min-width:52rem)]:space-y-density-3",
          )}
        >
          {selection && label && !idleContent ? (
            <Heading6 className="text-foreground hidden text-base font-semibold [@container(min-width:52rem)]:block">
              {label}
            </Heading6>
          ) : null}
          {description}
          <VerificationProbeResult
            result={result}
            resultSummary={resultSummary}
            detailsContent={detailsContent}
            status={selection ? status : undefined}
            selected={selected}
            defaultDetailsOpen={defaultDetailsOpen}
          />
          {hasPrompt ? (
            <VerificationPromptSettings
              controller={controller}
              probeId={probeId}
              autoOpen={hasResult ? false : undefined}
            />
          ) : null}
          {children}
          {idleContent}
        </div>
      </div>
    </div>
  )
}
