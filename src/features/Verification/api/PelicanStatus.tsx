import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import { DRAWING_VERIFICATION_OUTCOMES } from "~/services/verification/modelQuality/constants"
import { formatFullTime, formatRelativeTime } from "~/utils/core/formatters"

import type { PelicanPresentation } from "./pelicanPresentation"
import {
  VERIFICATION_TOOL_STATUSES,
  type VerificationToolsController,
} from "./useVerificationTools"
import { formatLatency } from "./utils"
import {
  VERIFICATION_HISTORY_KINDS,
  VerificationHistoryBadge,
} from "./VerificationHistoryBadge"

/** Drawing outcomes and timestamps retain their own semantics within the shared history badge. */
export function PelicanStatus({
  controller,
  presentation,
}: {
  controller: Pick<
    VerificationToolsController,
    "pelicanSummary" | "isPelicanRunning" | "pelicanStatus"
  >
  presentation: PelicanPresentation
}) {
  const { t } = useTranslation("aiApiVerification")
  const { pelicanSummary, isPelicanRunning, pelicanStatus } = controller
  const { historical, outcome, latencyMs } = presentation
  return (
    <div
      data-testid={pelicanSummary ? "pelican-history-summary" : undefined}
      className="text-muted-foreground space-y-density-1 text-xs"
    >
      <div className="gap-density-2 flex flex-wrap items-center">
        {historical ? (
          <VerificationHistoryBadge
            kind={VERIFICATION_HISTORY_KINDS.Drawing}
            label={
              outcome === DRAWING_VERIFICATION_OUTCOMES.Generated
                ? t("verifyDialog.tools.pelican.outcomes.generated")
                : outcome === DRAWING_VERIFICATION_OUTCOMES.Error
                  ? t("verifyDialog.tools.pelican.outcomes.error")
                  : t("verifyDialog.tools.pelican.outcomes.no-artifact")
            }
            latencyMs={latencyMs}
          />
        ) : (
          <Badge
            variant={
              outcome === DRAWING_VERIFICATION_OUTCOMES.Generated
                ? "success"
                : outcome === DRAWING_VERIFICATION_OUTCOMES.Error
                  ? "destructive"
                  : "outline"
            }
            size="sm"
          >
            {isPelicanRunning
              ? t("verifyDialog.actions.running")
              : pelicanStatus === VERIFICATION_TOOL_STATUSES.Stopped
                ? t("verifyDialog.status.stopped")
                : outcome === DRAWING_VERIFICATION_OUTCOMES.Generated
                  ? t("verifyDialog.tools.pelican.outcomes.generated")
                  : outcome === DRAWING_VERIFICATION_OUTCOMES.Error
                    ? t("verifyDialog.tools.pelican.outcomes.error")
                    : outcome === DRAWING_VERIFICATION_OUTCOMES.NoArtifact
                      ? t("verifyDialog.tools.pelican.outcomes.no-artifact")
                      : t("verifyDialog.status.pending")}
            {latencyMs != null && latencyMs > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatLatency(latencyMs)}</span>
              </>
            ) : null}
          </Badge>
        )}
        {pelicanSummary ? (
          <time
            dateTime={new Date(pelicanSummary.verifiedAt).toISOString()}
            title={formatFullTime(new Date(pelicanSummary.verifiedAt))}
          >
            {formatRelativeTime(new Date(pelicanSummary.verifiedAt))}
          </time>
        ) : null}
      </div>
    </div>
  )
}
