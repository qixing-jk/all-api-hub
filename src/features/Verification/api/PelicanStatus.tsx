import type { TFunction } from "i18next"
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

/** Keep the drawing badge and collapsed navigation on the same outcome. */
export function getPelicanStatusLabel(
  t: TFunction<"aiApiVerification">,
  controller: Pick<
    VerificationToolsController,
    "isPelicanRunning" | "pelicanStatus"
  >,
  presentation: PelicanPresentation,
) {
  return controller.isPelicanRunning
    ? t("verifyDialog.actions.running")
    : controller.pelicanStatus === VERIFICATION_TOOL_STATUSES.Stopped
      ? t("verifyDialog.status.stopped")
      : presentation.outcome === DRAWING_VERIFICATION_OUTCOMES.Generated
        ? t("verifyDialog.tools.pelican.outcomes.generated")
        : presentation.outcome === DRAWING_VERIFICATION_OUTCOMES.Error
          ? t("verifyDialog.tools.pelican.outcomes.error")
          : presentation.outcome === DRAWING_VERIFICATION_OUTCOMES.NoArtifact
            ? t("verifyDialog.tools.pelican.outcomes.no-artifact")
            : t("verifyDialog.status.pending")
}

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
  const { pelicanSummary } = controller
  const { historical, outcome, latencyMs } = presentation
  return (
    <div
      data-testid={pelicanSummary ? "pelican-history-summary" : undefined}
      className="space-y-density-1 text-xs text-muted-foreground"
    >
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {historical ? (
          <VerificationHistoryBadge
            kind={VERIFICATION_HISTORY_KINDS.Drawing}
            label={getPelicanStatusLabel(t, controller, presentation)}
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
            {getPelicanStatusLabel(t, controller, presentation)}
            {latencyMs != null && latencyMs > 0 ? (
              <>
                <span aria-hidden="true" className="opacity-40">
                  ·
                </span>
                <span className="font-normal tabular-nums">
                  {formatLatency(latencyMs)}
                </span>
              </>
            ) : null}
          </Badge>
        )}
        {historical && pelicanSummary ? (
          <>
            <span aria-hidden="true" className="opacity-40">
              ·
            </span>
            <time
              dateTime={new Date(pelicanSummary.verifiedAt).toISOString()}
              title={formatFullTime(new Date(pelicanSummary.verifiedAt))}
              className="cursor-default"
            >
              {formatRelativeTime(new Date(pelicanSummary.verifiedAt))}
            </time>
          </>
        ) : null}
      </div>
    </div>
  )
}
