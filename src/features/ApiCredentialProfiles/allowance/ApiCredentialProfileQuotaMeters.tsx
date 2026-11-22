import { useTranslation } from "react-i18next"

import { Progress } from "~/components/ui"
import {
  API_CREDENTIAL_ALLOWANCE_LEVEL_CLASSES,
  getAllowanceCountdown,
  getQuotaAllowanceLevel,
  getQuotaWindowRemainingPercent,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialAllowance"
import {
  formatAllowanceCountdown,
  formatQuotaWindowAmount,
  formatQuotaWindowLabel,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialTelemetryFormatting"
import { useAllowanceClock } from "~/features/ApiCredentialProfiles/allowance/useAllowanceClock"
import { cn } from "~/lib/utils"
import { OBSERVATION_STATUSES } from "~/services/amounts/financialConstants"
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
    <div className="grid gap-x-2 gap-y-density-2 sm:grid-cols-2 lg:grid-cols-3">
      {windows.map((window, index) => {
        const windowLabel = formatQuotaWindowLabel(t, window.type)
        const remainingPercent = getQuotaWindowRemainingPercent(window)
        const hasPercent =
          remainingPercent !== undefined && Number.isFinite(remainingPercent)
        const observedPercent =
          window.remainingPercent !== undefined &&
          Number.isFinite(window.remainingPercent)
            ? window.remainingPercent
            : undefined
        const level = getQuotaAllowanceLevel(remainingPercent)
        const levelClasses = API_CREDENTIAL_ALLOWANCE_LEVEL_CLASSES[level]
        const countdown = getAllowanceCountdown(window.resetTime, now)
        const amountLabel = formatQuotaWindowAmount(window, t)

        return (
          <div
            key={`${window.type}-${index}`}
            className="rounded-md border border-border-subtle bg-card px-2 py-density-2 dark:bg-secondary/60"
          >
            <div className="flex min-w-0 items-baseline justify-between gap-density-1">
              <span className="min-w-0 text-xs break-words text-muted-foreground">
                {windowLabel}
                {window.status === OBSERVATION_STATUSES.Stale
                  ? ` (${t("apiCredentialProfiles:telemetry.balanceSemantics.stale")})`
                  : ""}
              </span>
              <span
                className={cn(
                  "min-w-0 text-right text-sm font-semibold break-words tabular-nums",
                  observedPercent === undefined &&
                    amountLabel &&
                    window.status !== OBSERVATION_STATUSES.Stale
                    ? "text-foreground"
                    : levelClasses.text,
                )}
              >
                {observedPercent !== undefined
                  ? t(
                      "apiCredentialProfiles:telemetry.quotaWindows.remainingPercent",
                      { percent: Math.round(observedPercent) },
                    )
                  : (amountLabel ??
                    t("apiCredentialProfiles:telemetry.notProvided"))}
              </span>
            </div>

            {hasPercent ? (
              <Progress
                className="mt-density-1-5 h-1.5"
                value={remainingPercent}
                max={100}
                indicatorClassName={levelClasses.indicator}
                aria-label={t(
                  "apiCredentialProfiles:telemetry.quotaWindows.meterLabel",
                  {
                    window: windowLabel,
                  },
                )}
              />
            ) : null}

            <div className="mt-density-1 flex min-w-0 flex-wrap items-center justify-between gap-x-density-2 text-3xs text-muted-foreground">
              {observedPercent !== undefined && amountLabel ? (
                <span className="min-w-0 break-words tabular-nums">
                  {amountLabel}
                </span>
              ) : null}
              {window.remaining !== undefined && window.limit === undefined && (
                <span>
                  {t(
                    "apiCredentialProfiles:telemetry.quotaWindows.limitNotProvided",
                  )}
                </span>
              )}
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
            {window.status === OBSERVATION_STATUSES.Stale &&
              window.observedAt !== undefined && (
                <time
                  className="mt-1 block text-xs text-muted-foreground"
                  dateTime={new Date(window.observedAt).toISOString()}
                >
                  {formatLocaleDateTime(window.observedAt)}
                </time>
              )}
            {(["limit", "used", "remaining", "remainingPercent"] as const).map(
              (field) => {
                const amount = window.retainedAmounts?.[field]
                if (!amount) return null
                const values = { value: amount.value.toLocaleString() }
                const label =
                  field === "limit"
                    ? t(
                        "apiCredentialProfiles:telemetry.quotaWindows.retainedLimit",
                        values,
                      )
                    : field === "used"
                      ? t(
                          "apiCredentialProfiles:telemetry.quotaWindows.retainedUsed",
                          values,
                        )
                      : field === "remaining"
                        ? t(
                            "apiCredentialProfiles:telemetry.quotaWindows.retainedRemaining",
                            values,
                          )
                        : t(
                            "apiCredentialProfiles:telemetry.quotaWindows.retainedPercent",
                            values,
                          )
                return (
                  <div
                    key={field}
                    className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground"
                  >
                    <span className="text-warning-text">{label}</span>
                    <time dateTime={new Date(amount.observedAt).toISOString()}>
                      {formatLocaleDateTime(amount.observedAt)}
                    </time>
                  </div>
                )
              },
            )}
          </div>
        )
      })}
    </div>
  )
}
