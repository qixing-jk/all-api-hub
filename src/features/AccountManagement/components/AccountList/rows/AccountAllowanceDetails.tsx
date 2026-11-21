import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Progress } from "~/components/ui"
import { useBalanceAsOf } from "~/features/AccountManagement/data/useBalanceAsOf"
import {
  accountAllowanceEntryKey,
  type AccountAllowanceEntry,
  type AccountAllowanceSnapshot,
} from "~/services/accounts/allowances"
import { isKnownOrStaleObservation } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_VALIDITY_KINDS,
  BUDGET_AMOUNT_FIELDS,
  BUDGET_LIMIT_STATES,
  BUDGET_WINDOW_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import {
  formatBalanceScope,
  formatBalanceSource,
  formatBalanceWindow,
} from "~/utils/core/balancePresentation"
import {
  formatAllowanceLabel,
  formatBudgetAmount,
  formatBudgetRules,
  getBudgetMetricLabel,
} from "~/utils/core/budgetPresentation"

import { FinancialObservationDetails } from "../../FinancialObservationDetails"

/** Only coherent, current observations can describe a plan's utilization. */
function getUsagePercentage(entry: AccountAllowanceEntry, asOf: number) {
  const { limit, used, stateObservation, enabled, window, limitState, asset } =
    entry.constraint
  if (
    limitState !== BUDGET_LIMIT_STATES.Finite ||
    asset.kind === ASSET_KINDS.Unknown ||
    limit.status !== OBSERVATION_STATUSES.Known ||
    used.status !== OBSERVATION_STATUSES.Known ||
    stateObservation.status !== OBSERVATION_STATUSES.Known ||
    enabled.status !== OBSERVATION_STATUSES.Known ||
    !enabled.value ||
    (entry.validity.kind === BALANCE_VALIDITY_KINDS.Expires &&
      entry.validity.at <= asOf) ||
    ("resetsAt" in window &&
      window.resetsAt !== undefined &&
      window.resetsAt <= asOf) ||
    [limit, used].some(
      (amount) =>
        amount.observedAt !== stateObservation.observedAt ||
        amount.source.adapter !== stateObservation.source.adapter ||
        amount.source.operation !== stateObservation.source.operation ||
        amount.source.contractVersion !==
          stateObservation.source.contractVersion ||
        amount.source.kind !== stateObservation.source.kind,
    )
  )
    return undefined
  const ceiling = Number(limit.value)
  const consumption = Number(used.value)
  // Only the visual fill is approximate; every reported amount stays exact.
  return Number.isFinite(ceiling) &&
    ceiling > 0 &&
    Number.isFinite(consumption) &&
    consumption >= 0
    ? Math.min(1, consumption / ceiling) * 100
    : undefined
}

/** Every plan retains its own unit, scope, window and observation clock. */
export function AccountAllowanceDetails({
  snapshot,
}: {
  snapshot: AccountAllowanceSnapshot
}) {
  const { t, i18n } = useTranslation("account")
  const timeSources = useMemo(() => [{ allowances: snapshot }], [snapshot])
  const asOf = useBalanceAsOf(timeSources)
  return (
    <dl className="mt-3 space-y-2 text-left">
      {snapshot.entries.map((entry) => {
        const budget = entry.constraint
        const observation = budget.stateObservation
        const window = budget.window
        const usagePercentage = getUsagePercentage(entry, asOf)
        const rules = formatBudgetRules(budget, t)
        const secondaryMetrics = (
          ["limit", "used", "reserved"] as const
        ).filter((metric) => isKnownOrStaleObservation(budget[metric]))
        const remainingOnly =
          secondaryMetrics.length === 0 &&
          isKnownOrStaleObservation(budget.remaining)
        const elapsedStatus =
          entry.validity.kind === BALANCE_VALIDITY_KINDS.Expires &&
          entry.validity.at <= asOf
            ? t("balanceHistory:native.expired")
            : "resetsAt" in window &&
                window.resetsAt !== undefined &&
                window.resetsAt <= asOf
              ? `${t("balanceHistory:native.reset")} · ${t("financial.lastKnown")}`
              : undefined
        const updated = isKnownOrStaleObservation(budget.remaining)
          ? budget.remaining
          : observation
        return (
          <div
            key={accountAllowanceEntryKey(entry)}
            role="group"
            aria-label={formatAllowanceLabel(entry, t)}
            className="space-y-2.5 border-border/50 py-3 not-first:border-t"
          >
            <dt className="text-sm font-medium">
              {formatAllowanceLabel(entry, t)}
            </dt>
            <dd>
              <dl
                className={`grid gap-x-3 gap-y-2.5 ${secondaryMetrics.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
              >
                {[BUDGET_AMOUNT_FIELDS.Remaining, ...secondaryMetrics].map(
                  (metric) => (
                    <div
                      key={metric}
                      className={
                        metric === BUDGET_AMOUNT_FIELDS.Remaining
                          ? "col-span-full flex items-baseline justify-between gap-3"
                          : "min-w-0 space-y-1"
                      }
                    >
                      <dt className="text-muted-foreground">
                        {getBudgetMetricLabel(metric, t)}
                      </dt>
                      <dd
                        className={
                          metric === BUDGET_AMOUNT_FIELDS.Remaining
                            ? "min-w-0 text-right text-lg leading-tight font-semibold tracking-tight break-words tabular-nums"
                            : "text-xs font-medium break-words tabular-nums"
                        }
                      >
                        {formatBudgetAmount(budget, metric, t)}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            </dd>
            {elapsedStatus && (
              <dd className="text-xs text-warning-text">{elapsedStatus}</dd>
            )}
            {remainingOnly && (
              <dd className="text-xs text-muted-foreground">
                {t("financial.remainingOnly")}
              </dd>
            )}
            {usagePercentage !== undefined && (
              <dd>
                <Progress
                  role="meter"
                  aria-label={formatAllowanceLabel(entry, t)}
                  aria-valuetext={`${formatBudgetAmount(budget, BUDGET_AMOUNT_FIELDS.Used, t)} / ${formatBudgetAmount(budget, BUDGET_AMOUNT_FIELDS.Limit, t)}`}
                  value={usagePercentage}
                  className="h-1 bg-muted"
                />
              </dd>
            )}
            {budget.limitState === BUDGET_LIMIT_STATES.Inherited &&
              isKnownOrStaleObservation(budget.remaining) && (
                <dd>{t("keyManagement:financial.inherited")}</dd>
              )}
            {(window.kind === BUDGET_WINDOW_KINDS.Lifetime ||
              window.kind === BUDGET_WINDOW_KINDS.Rolling) && (
              <dd className="break-words text-muted-foreground">{rules[0]}</dd>
            )}
            {rules.slice(1).map((line) => (
              <dd key={line} className="break-words text-muted-foreground">
                {line}
              </dd>
            ))}
            {isKnownOrStaleObservation(updated) && (
              <dd className="text-xs text-muted-foreground">
                <time dateTime={new Date(updated.observedAt).toISOString()}>
                  {t("common:time.updatedAt", {
                    time: new Date(updated.observedAt).toLocaleString(
                      i18n.language,
                    ),
                  })}
                </time>
              </dd>
            )}
            <dd>
              <FinancialObservationDetails>
                {formatBalanceScope(budget.scope, t, true).map((line) => (
                  <p key={line}>{line}</p>
                ))}
                {entry.validity.kind === BALANCE_VALIDITY_KINDS.Unknown && (
                  <p>{t("financial.validityUnknown")}</p>
                )}
                {window.kind === BUDGET_WINDOW_KINDS.Unknown && (
                  <p>{rules[0]}</p>
                )}
                <p>{formatBalanceSource(observation.source, t, true)}</p>
                {(["limit", "used", "remaining", "reserved"] as const).map(
                  (metric) => {
                    const amount = budget[metric]
                    if (!isKnownOrStaleObservation(amount)) return null
                    return (
                      <p key={metric}>
                        {getBudgetMetricLabel(metric, t)} ·{" "}
                        {amount.status === OBSERVATION_STATUSES.Stale
                          ? t("financial.lastKnown")
                          : t("financial.observed")}{" "}
                        ·{" "}
                        {new Date(amount.observedAt).toLocaleString(
                          i18n.language,
                        )}
                      </p>
                    )
                  },
                )}
                {isKnownOrStaleObservation(observation) && (
                  <p>
                    {observation.status === OBSERVATION_STATUSES.Stale
                      ? t("financial.lastKnown")
                      : t("financial.observed")}{" "}
                    ·{" "}
                    {new Date(observation.observedAt).toLocaleString(
                      i18n.language,
                    )}
                  </p>
                )}
              </FinancialObservationDetails>
            </dd>
            {(window.kind === BUDGET_WINDOW_KINDS.Rolling ||
              window.kind === BUDGET_WINDOW_KINDS.Periodic) &&
              formatBalanceWindow(window.observation, t, i18n.language).map(
                (line) => <dd key={line}>{line}</dd>,
              )}
            {entry.validity.kind === BALANCE_VALIDITY_KINDS.Expires && (
              <dd>
                {t("financial.expires", {
                  date: new Date(entry.validity.at).toLocaleString(
                    i18n.language,
                  ),
                })}
              </dd>
            )}
            {entry.reportedTiming?.expiresAt &&
              entry.validity.kind === BALANCE_VALIDITY_KINDS.Unknown && (
                <dd>
                  {t("financial.expires", {
                    date: entry.reportedTiming.expiresAt,
                  })}{" "}
                  · {t("financial.timingUnknown")}
                </dd>
              )}
            {entry.reportedTiming?.startsAt && (
              <dd>
                {t("financial.startsAt")}: {entry.reportedTiming.startsAt}
              </dd>
            )}
            {entry.reportedTiming?.resetsAt &&
              !("resetsAt" in window && window.resetsAt !== undefined) && (
                <dd>
                  {t("financial.resetsAt")}: {entry.reportedTiming.resetsAt} ·{" "}
                  {t("financial.timingUnknown")}
                </dd>
              )}
            {formatBalanceScope(budget.scope, t).map((line) => (
              <dd className="break-words text-muted-foreground" key={line}>
                {line}
              </dd>
            ))}
          </div>
        )
      })}
    </dl>
  )
}
