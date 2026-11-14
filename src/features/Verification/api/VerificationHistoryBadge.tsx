import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Badge } from "~/components/ui"
import type { ApiVerificationMode } from "~/services/verification/aiApiVerification"
import { getApiVerificationModeLabel } from "~/services/verification/aiApiVerification/i18n"

import { formatLatency } from "./utils"

export const VERIFICATION_HISTORY_KINDS = {
  Probe: "probe",
  Drawing: "drawing",
  Context: "context",
  Needle: "needle",
} as const

export type VerificationHistoryKind =
  (typeof VERIFICATION_HISTORY_KINDS)[keyof typeof VERIFICATION_HISTORY_KINDS]

/** Distinguish restored outcomes and disclose which evidence was saved. */
export function VerificationHistoryBadge({
  label,
  kind,
  latencyMs,
  mode,
  className,
}: {
  label: string
  kind: VerificationHistoryKind
  latencyMs?: number | null
  mode?: ApiVerificationMode
  className?: string
}) {
  const { t } = useTranslation("aiApiVerification")
  const previousResult = t("verifyDialog.history.previousResult", {
    result: label,
  })
  const explanation = {
    [VERIFICATION_HISTORY_KINDS.Probe]: t("verifyDialog.history.storage.probe"),
    [VERIFICATION_HISTORY_KINDS.Drawing]: t(
      "verifyDialog.history.storage.drawing",
    ),
    [VERIFICATION_HISTORY_KINDS.Context]: t(
      "verifyDialog.history.storage.context",
    ),
    [VERIFICATION_HISTORY_KINDS.Needle]: t(
      "verifyDialog.history.storage.needle",
    ),
  }[kind]
  const modeLabel = mode ? getApiVerificationModeLabel(t, mode) : null
  const modeContent = modeLabel ? (
    <>
      <span aria-hidden="true" className="opacity-40">
        ·
      </span>
      <span className="font-normal">{modeLabel}</span>
    </>
  ) : null
  const latencyText =
    latencyMs != null && latencyMs > 0 ? formatLatency(latencyMs) : null

  return (
    <Tooltip
      content={explanation}
      className="max-w-72"
      anchorAsChild
      openOnClick
      position="top-start"
      positionStrategy="fixed"
      portalContainer={document.body}
    >
      <button
        type="button"
        className="inline-flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Badge variant="secondary" size="sm" className={className}>
          <span>{previousResult}</span>
          {latencyText ? (
            <>
              <span aria-hidden="true" className="opacity-40">
                ·
              </span>
              <span className="font-normal tabular-nums">{latencyText}</span>
            </>
          ) : null}
          {modeContent}
        </Badge>
      </button>
    </Tooltip>
  )
}
