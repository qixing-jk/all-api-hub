import { useTranslation } from "react-i18next"

import { FINANCIAL_METRIC_KINDS } from "~/components/financialMetricKinds"
import { FinancialMetricLabel } from "~/components/FinancialMetricLabel"
import { Caption } from "~/components/ui"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import {
  formatTokenCount,
  getTodayMetricPresentation,
} from "~/utils/core/formatters"

import { formatAccountMetricCoverage } from "./accountMetricCoverage"

/** Shows the token total in the overview and reliable counts and coverage in details. */
export function TokenStats({ detailed = false }: { detailed?: boolean }) {
  const { t, i18n } = useTranslation("account")
  const { stats } = useAccountDataContext()
  const prompt = stats.today_total_prompt_tokens
  const completion = stats.today_total_completion_tokens
  const coverage = stats.todayStatsCoverage.tokens
  const { value, requiresRefresh } = getTodayMetricPresentation(
    prompt + completion,
    coverage,
  )
  const label = t("stats.todayTokens")
  const status = t(
    requiresRefresh
      ? "todayMetricAvailability.pendingRefresh"
      : "financial.unavailable",
  )

  return (
    <section aria-label={label} className="min-w-0 space-y-1">
      <div
        className={
          detailed
            ? "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
            : undefined
        }
      >
        <Caption
          as={detailed ? "h4" : "p"}
          className={detailed ? "font-semibold text-foreground" : "font-medium"}
        >
          <FinancialMetricLabel kind={FINANCIAL_METRIC_KINDS.Tokens}>
            {label}
          </FinancialMetricLabel>
        </Caption>
        {detailed &&
          (value === null ? (
            <p className="ml-auto text-muted-foreground">{status}</p>
          ) : (
            <p className="ml-auto min-w-0 text-base font-semibold break-words tabular-nums">
              {value.toLocaleString(i18n.language)}
            </p>
          ))}
      </div>
      {detailed ? (
        <div className="space-y-1 pl-5">
          {value === null ? (
            requiresRefresh && (
              <p className="text-muted-foreground">
                {t("todayMetricAvailability.pendingRefreshHelp")}
              </p>
            )
          ) : (
            <>
              {coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Complete && (
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <div className="flex gap-1">
                    <dt>{t("stats.prompt")}</dt>
                    <dd className="font-medium text-foreground tabular-nums">
                      {prompt.toLocaleString(i18n.language)}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>{t("stats.completion")}</dt>
                    <dd className="font-medium text-foreground tabular-nums">
                      {completion.toLocaleString(i18n.language)}
                    </dd>
                  </div>
                </dl>
              )}
              <p className="text-muted-foreground">
                {coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Complete
                  ? t("financial.coverage", {
                      included: coverage.completeCount,
                      eligible: coverage.eligibleCount,
                    })
                  : formatAccountMetricCoverage(coverage, t)}
              </p>
            </>
          )}
        </div>
      ) : value === null ? (
        <p className="text-sm text-muted-foreground">{status}</p>
      ) : (
        <p className="text-base leading-snug font-semibold tracking-tight tabular-nums">
          {formatTokenCount(value)}
        </p>
      )}
    </section>
  )
}
