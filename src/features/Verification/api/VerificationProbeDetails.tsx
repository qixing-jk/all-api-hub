import {
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import {
  VERIFICATION_RAIL_STATUS_VARIANTS,
  type VerificationRailStatusVariant,
} from "~/features/Verification/api/types"
import type { VerificationToolsController } from "~/features/Verification/api/useVerificationTools"
import {
  useVerificationProbeSelection,
  VerificationDetailContext,
} from "~/features/Verification/api/VerificationSelectionContext"
import { type VerificationTestId } from "~/features/Verification/api/VerificationTestLabel"
import { cn } from "~/lib/utils"
import {
  API_VERIFICATION_PROBE_STATUSES,
  type ApiVerificationProbeId,
} from "~/services/verification/aiApiVerification/types"

import { VERIFICATION_PROBE_INTERRUPTION_STATUSES } from "./types"
import { useVerificationDetailPortal } from "./useVerificationDetailPortal"
import {
  VerificationProbeResult,
  type ProbeDetailsResult,
  type ProbeGenerationState,
} from "./VerificationProbeResult"
import { VerificationProbeSummary } from "./VerificationProbeSummary"
import { VerificationPromptEditor } from "./VerificationPromptEditor"

/** Keeps a test's editable configuration separate from the evidence of its last run. */
export function VerificationProbeDetails({
  controller,
  probeId,
  testId,
  result,
  label,
  heading,
  headingAccessory,
  description,
  resultSummary,
  status,
  statusInteractive = false,
  statusVariant,
  statusLabel,
  running,
  action,
  detailAction,
  children,
  detailsContent,
  generation,
  idleContent,
  settings,
  composer,
  promptAction,
  question,
}: {
  label?: string
  heading?: ReactNode
  headingAccessory?: ReactNode
  description?: ReactNode
  resultSummary?: ReactNode
  status?: ReactNode
  statusInteractive?: boolean
  statusVariant?: VerificationRailStatusVariant
  statusLabel?: string
  running?: boolean
  action?: ReactNode
  detailAction?: ReactNode
  children?: ReactNode
  detailsContent?: ReactNode
  generation?: ProbeGenerationState
  idleContent?: ReactNode
  settings?: ReactNode
  composer?: ReactNode
  promptAction?: ComponentProps<typeof VerificationPromptEditor>["action"]
  question?: string
  controller?: VerificationToolsController
  probeId?: ApiVerificationProbeId
  testId?: VerificationTestId
  result?: ProbeDetailsResult | null
}) {
  const { t } = useTranslation("aiApiVerification")
  const id = useId()
  const { selection, selected, detailCovered } =
    useVerificationProbeSelection(id)
  const { detailContainer, attachDetailParking } = useVerificationDetailPortal(
    selection && !selection.isWide ? selection.detailTarget : null,
  )
  const [headerTarget, setHeaderTarget] = useState<HTMLDivElement | null>(null)
  const register = selection?.register
  useEffect(() => register?.(id, label), [register, id, label])
  const headerActionsTarget = selection?.isWide
    ? headerTarget
    : (selection?.headerStatusTarget ?? headerTarget)
  const showDetailAction = selected && !detailCovered && Boolean(detailAction)
  const hasResult = Boolean(
    result || detailsContent || generation || resultSummary || question,
  )
  const hasPrompt =
    controller && probeId && controller.promptIds.includes(probeId)
  const settingsContent = settings
  const composerContent =
    composer ??
    (hasPrompt ? (
      <VerificationPromptEditor
        controller={controller}
        probeId={probeId}
        action={promptAction}
        running={generation?.running}
      />
    ) : null)
  const resolvedTestId = testId ?? probeId
  const isRunning = Boolean(running || generation?.running)
  const resolvedStatusVariant =
    statusVariant ??
    (isRunning
      ? VERIFICATION_RAIL_STATUS_VARIANTS.Running
      : result && "status" in result
        ? result.status === API_VERIFICATION_PROBE_STATUSES.Pass
          ? VERIFICATION_RAIL_STATUS_VARIANTS.Success
          : result.status === API_VERIFICATION_PROBE_STATUSES.Fail
            ? VERIFICATION_RAIL_STATUS_VARIANTS.Danger
            : result.status === API_VERIFICATION_PROBE_STATUSES.Unsupported ||
                result.status ===
                  VERIFICATION_PROBE_INTERRUPTION_STATUSES.Stopped ||
                result.status ===
                  VERIFICATION_PROBE_INTERRUPTION_STATUSES.Timeout
              ? VERIFICATION_RAIL_STATUS_VARIANTS.Warning
              : undefined
        : undefined)
  const resolvedStatusLabel =
    statusLabel ?? (isRunning ? t("verifyDialog.actions.running") : undefined)

  const detail = (
    <div
      id={`${id}-detail`}
      hidden={!selected}
      aria-hidden={detailCovered ? true : undefined}
      inert={detailCovered}
      data-verification-detail
      data-verification-detail-probe={probeId}
      className={cn(
        "min-w-0",
        selection &&
          "my-1 p-2 [@container(min-width:52rem)]:absolute [@container(min-width:52rem)]:inset-y-0 [@container(min-width:52rem)]:right-(--verification-settings-space) [@container(min-width:52rem)]:left-(--verification-list-width) [@container(min-width:52rem)]:my-0 [@container(min-width:52rem)]:overflow-y-auto [@container(min-width:52rem)]:p-5",
      )}
    >
      <VerificationDetailContext.Provider
        value={
          selection ? { headerTarget, headerActionsTarget, selected } : null
        }
      >
        <div
          data-verification-detail-content
          className="flex min-h-0 flex-col gap-density-2 [@container(min-width:52rem)]:h-full [@container(min-width:52rem)]:gap-density-3 [@container(min-width:52rem)]:[&>*:not([data-slot=verification-result])]:shrink-0"
        >
          {description}
          <VerificationProbeResult
            result={result}
            resultSummary={resultSummary}
            detailsContent={detailsContent}
            generation={generation}
            selected={selected}
            question={question}
          />
          {!selection?.settingsTarget ? settingsContent : null}
          {children}
          {idleContent}
          {composerContent}
          {showDetailAction ? (
            <div className="mt-auto shrink-0 pt-3">{detailAction}</div>
          ) : null}
        </div>
      </VerificationDetailContext.Provider>
    </div>
  )

  if (!heading && !action && !hasPrompt && !hasResult) return null
  return (
    <div
      data-verification-probe={probeId}
      data-testid={probeId ? `verification-prompt-${probeId}` : undefined}
    >
      <VerificationProbeSummary
        probeId={probeId}
        id={id}
        label={label}
        heading={heading}
        headingAccessory={headingAccessory}
        status={status}
        statusInteractive={statusInteractive}
        statusVariant={resolvedStatusVariant}
        statusLabel={resolvedStatusLabel}
        testId={resolvedTestId}
        action={showDetailAction ? null : action}
      />
      {selection?.headerStatusTarget && status
        ? createPortal(
            <div
              hidden={!selected}
              className="flex shrink-0 items-center gap-2"
              data-verification-header-status
            >
              {status}
            </div>,
            selection.headerStatusTarget,
            `${id}-identity-status`,
          )
        : null}
      {selection?.headerTarget
        ? createPortal(
            <div
              hidden={!selected}
              className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
              data-verification-test-header
              data-probe-id={probeId}
            >
              {status && !selection.headerStatusTarget ? (
                <div
                  className="flex shrink-0 items-center gap-2"
                  data-verification-header-status
                >
                  {status}
                </div>
              ) : null}
              {(selection?.listCollapsed || (selection && !selection.isWide)) &&
              action &&
              !detailAction ? (
                <div
                  data-verification-header-actions
                  className="flex shrink-0 items-center"
                >
                  {action}
                </div>
              ) : null}
              <div
                ref={setHeaderTarget}
                data-verification-header-details
                className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
              />
            </div>,
            selection.headerTarget,
            `${id}-status`,
          )
        : null}
      {selection?.settingsTarget && settingsContent
        ? createPortal(
            <div
              hidden={!selected}
              className="space-y-2"
              data-verification-test-settings
              onKeyDown={selection.onSettingsKeyDown}
            >
              <VerificationDetailContext.Provider
                value={{
                  headerTarget,
                  headerActionsTarget,
                  selected,
                  settingsTitle: `${t("verifyDialog.workspace.currentTest")}${label ? ` · ${label}` : ""}`,
                }}
              >
                {settingsContent}
              </VerificationDetailContext.Provider>
            </div>,
            selection.settingsTarget,
            id,
          )
        : null}
      {/* Keep desktop grouping; park mobile detail outside the sliding list. */}
      <div ref={attachDetailParking} className="contents" />
      {createPortal(detail, detailContainer, `${id}-detail`)}
    </div>
  )
}
