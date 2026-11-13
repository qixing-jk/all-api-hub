import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import { ProbeStatusBadge } from "~/features/Verification/api/ProbeStatusBadge"
import { VERIFICATION_RAIL_STATUS_VARIANTS } from "~/features/Verification/api/types"
import type { VerificationToolsController } from "~/features/Verification/api/useVerificationTools"
import { VerificationProbeDetails } from "~/features/Verification/api/VerificationProbeDetails"
import { VerificationProbeIntroduction } from "~/features/Verification/api/VerificationProbeIntroduction"
import { VerificationRunButton } from "~/features/Verification/api/VerificationRunButton"
import { VerificationTestLabel } from "~/features/Verification/api/VerificationTestLabel"
import type {
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import type { VerificationGenerationProgress } from "~/services/verification/aiApiVerification/generationProgress"
import { getApiVerificationProbeLabel } from "~/services/verification/aiApiVerification/i18n"
import {
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
} from "~/services/verification/aiApiVerification/types"

import { getVerificationProbeStatusLabel } from "./ProbeStatusBadge"
import { VERIFICATION_PROBE_INTERRUPTION_STATUSES } from "./types"
import { useVerificationRunPrompt } from "./useVerificationRunPrompt"

/** Shared test presentation; each workspace retains request and cancellation ownership. */
export function VerificationProbeRow({
  controller,
  probeId,
  result,
  summary,
  runButtonProps,
  isRunning = false,
  progress,
  startedAt,
  historical = false,
}: {
  controller?: VerificationToolsController
  probeId: ApiVerificationProbeId
  result: ApiVerificationProbeResult | null
  summary?: string | null
  runButtonProps: ComponentProps<typeof VerificationRunButton> & {
    "data-testid"?: string
  }
  progress?: VerificationGenerationProgress
  startedAt?: number
  isRunning?: boolean
  historical?: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  const label = getApiVerificationProbeLabel(t, probeId)
  const input = !isRunning ? result?.input : undefined
  const recordedPrompt =
    input && typeof input === "object"
      ? "prompt" in input && typeof input.prompt === "string"
        ? input.prompt
        : "input" in input && typeof input.input === "string"
          ? input.input
          : undefined
      : undefined
  const question = useVerificationRunPrompt({
    running: isRunning,
    startedAt,
    draft:
      controller?.promptDraft[probeId]?.trim() ||
      controller?.getDefaultPrompt(probeId) ||
      undefined,
    resultPrompt: recordedPrompt,
  })
  const idle = !result && !isRunning && !question
  const conciseSuccess =
    !historical &&
    result?.status === API_VERIFICATION_PROBE_STATUSES.Pass &&
    result.summaryKey === "verifyDialog.summaries.textGenerationSucceeded" &&
    Boolean(progress?.text || result.output)
  return (
    <VerificationProbeDetails
      promptAction={runButtonProps}
      controller={controller}
      probeId={probeId}
      testId={probeId}
      running={isRunning}
      statusLabel={
        isRunning
          ? t("verifyDialog.actions.running")
          : result
            ? getVerificationProbeStatusLabel(t, result)
            : t("verifyDialog.status.pending")
      }
      statusVariant={
        isRunning
          ? VERIFICATION_RAIL_STATUS_VARIANTS.Running
          : result?.status === API_VERIFICATION_PROBE_STATUSES.Pass
            ? VERIFICATION_RAIL_STATUS_VARIANTS.Success
            : result?.status === API_VERIFICATION_PROBE_STATUSES.Fail
              ? VERIFICATION_RAIL_STATUS_VARIANTS.Danger
              : result?.status ===
                    API_VERIFICATION_PROBE_STATUSES.Unsupported ||
                  result?.status ===
                    VERIFICATION_PROBE_INTERRUPTION_STATUSES.Stopped ||
                  result?.status ===
                    VERIFICATION_PROBE_INTERRUPTION_STATUSES.Timeout
                ? VERIFICATION_RAIL_STATUS_VARIANTS.Warning
                : undefined
      }
      label={label}
      result={isRunning ? null : result}
      question={question}
      generation={
        isRunning || progress
          ? {
              progress,
              running: isRunning,
              startedAt,
              partial:
                !isRunning &&
                result?.status !== API_VERIFICATION_PROBE_STATUSES.Pass,
            }
          : undefined
      }
      idleContent={
        idle || (historical && !isRunning) ? (
          <VerificationProbeIntroduction
            probeId={probeId}
            title={label}
            onRun={runButtonProps.onClick}
            disabled={runButtonProps.disabled || runButtonProps.loading}
            note={
              historical ? t("verifyDialog.history.storage.probe") : undefined
            }
          />
        ) : undefined
      }
      heading={
        <div className="min-w-0 text-sm font-medium text-foreground">
          <VerificationTestLabel testId={probeId}>
            {label}
          </VerificationTestLabel>
        </div>
      }
      resultSummary={
        !isRunning
          ? conciseSuccess
            ? ""
            : (summary ?? result?.summary)
          : undefined
      }
      action={<VerificationRunButton {...runButtonProps} />}
      status={
        isRunning ? (
          <Badge variant="outline" size="sm">
            {t("verifyDialog.actions.running")}
          </Badge>
        ) : result ? (
          <ProbeStatusBadge result={result} historical={historical} />
        ) : (
          <Badge variant="outline" size="sm">
            {t("verifyDialog.status.pending")}
          </Badge>
        )
      }
      statusInteractive={!isRunning && Boolean(result) && historical}
      detailAction={
        probeId === API_VERIFICATION_PROBE_IDS.Models &&
        !idle &&
        !historical &&
        !isRunning ? (
          <VerificationRunButton
            {...runButtonProps}
            variant={isRunning ? "secondary" : "default"}
          />
        ) : null
      }
    />
  )
}
