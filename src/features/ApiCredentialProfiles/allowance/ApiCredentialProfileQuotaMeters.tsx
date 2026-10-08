import { useTranslation } from "react-i18next"

import { Progress } from "~/components/ui"
import {
  API_CREDENTIAL_ALLOWANCE_LEVEL_CLASSES,
  getAllowanceCountdown,
  getQuotaAllowanceLevel,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialAllowance"
import {
  formatAllowanceCountdown,
  formatQuotaWindowAmount,
  formatQuotaWindowLabel,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialTelemetryFormatting"
import { useAllowanceClock } from "~/features/ApiCredentialProfiles/allowance/useAllowanceClock"
import { cn } from "~/lib/utils"
import type { ApiCredentialTelemetryQuotaWindowFact } from "~/types/apiCredentialProfiles"
import { formatLocaleDateTime } from "~/utils/core/formatters"

type ApiCredentialProfileQuotaMetersProps = {
  windows: ApiCredentialTelemetryQuotaWindowFact[]
}

/**
 * Renders each provider quota window as a meter instead of a sentence.
 *
 * Windows keep provider order so the layout stays stable between refreshes;
 * only the threshold coloring and countdown change as a window drains.
 */
export function ApiCredentialProfileQuotaMeters({
  windows,
}: ApiCredentialProfileQuotaMetersProps) {
  const { t } = useTranslation(["apiCredentialProfiles", "common"])
  const now = useAllowanceClock()

  return (
    <div className="gap-y-density-2 grid gap-x-2 sm:grid-cols-2 lg:grid-cols-3">
      {windows.map((window, index) => {
        const windowLabel = formatQuotaWindowLabel(t, window.type)
        const hasPercent = Number.isFinite(window.remainingPercent)
        const level = getQuotaAllowanceLevel(window.remainingPercent)
        const levelClasses = API_CREDENTIAL_ALLOWANCE_LEVEL_CLASSES[level]
        const countdown = getAllowanceCountdown(window.resetTime, now)
        const amountLabel = formatQuotaWindowAmount(window, t)

        return (
          <div
            key={`${window.type}-${index}`}
            className="dark:bg-secondary/60 bg-card border-border-subtle py-density-2 rounded-md border px-2"
          >
            <div className="gap-density-1 flex min-w-0 items-baseline justify-between">
              <span className="text-muted-foreground truncate text-xs">
                {windowLabel}
              </span>
              <span
                className={cn(
                  "shrink-0 text-sm font-semibold tabular-nums",
                  levelClasses.text,
                )}
              >
                {hasPercent
                  ? t(
                      "apiCredentialProfiles:telemetry.quotaWindows.remainingPercent",
                      { percent: Math.round(window.remainingPercent) },
                    )
                  : t("apiCredentialProfiles:telemetry.notProvided")}
              </span>
            </div>

            <Progress
              className="mt-density-1-5 h-1.5"
              value={hasPercent ? window.remainingPercent : 0}
              max={100}
              indicatorClassName={levelClasses.indicator}
              aria-label={t(
                "apiCredentialProfiles:telemetry.quotaWindows.meterLabel",
                {
                  window: windowLabel,
                },
              )}
            />

            <div className="text-muted-foreground mt-density-1 gap-x-density-2 text-3xs flex min-w-0 flex-wrap items-center justify-between">
              {amountLabel ? (
                <span className="truncate tabular-nums">{amountLabel}</span>
              ) : null}
              {countdown ? (
                <span
                  className="shrink-0 tabular-nums"
                  title={formatLocaleDateTime(
                    window.resetTime,
                    t("common:labels.notAvailable"),
                  )}
                >
                  {formatAllowanceCountdown(t, countdown)}
                </span>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
