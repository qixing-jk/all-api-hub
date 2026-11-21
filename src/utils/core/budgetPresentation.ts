import type { TFunction } from "i18next"

import type { Asset } from "~/services/amounts/assets"
import { isKnownOrStaleObservation } from "~/services/amounts/balance"
import type { Amount, Observed } from "~/services/amounts/balance"
import type { BudgetConstraint } from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BUDGET_AMOUNT_FIELDS,
  BUDGET_ENFORCEMENT,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { formatAssetAmount, formatCompactAssetAmount } from "~/utils/core/money"

type BudgetAmountFormatOptions = {
  showStatus?: boolean
  formatAmount?: (amount: Amount) => string
}

/** Currency and quota identity come from the adapter; no provider/field-name inference. */
export function formatBudgetObservedAmount(
  value: Observed<string>,
  asset: Asset,
  t: TFunction,
  compact = false,
  { showStatus = true, formatAmount }: BudgetAmountFormatOptions = {},
): string {
  if (asset.kind === ASSET_KINDS.Unknown || !isKnownOrStaleObservation(value))
    return t("common:labels.notAvailable")
  const formatted = (
    formatAmount ?? (compact ? formatCompactAssetAmount : formatAssetAmount)
  )({
    value: value.value,
    asset,
  })
  return showStatus && value.status === OBSERVATION_STATUSES.Stale
    ? `${formatted} (${t("keyManagement:financial.stale")})`
    : formatted
}

/** Nonnumeric states retain their own freshness even when no amount exists. */
function formatBudgetState(
  budget: BudgetConstraint,
  label: string,
  t: TFunction,
  { showStatus = true }: BudgetAmountFormatOptions = {},
): string {
  const state = budget.stateObservation
  if (!isKnownOrStaleObservation(state)) return t("common:labels.notAvailable")
  return showStatus && state.status === OBSERVATION_STATUSES.Stale
    ? `${label} (${t("keyManagement:financial.stale")})`
    : label
}

/** Limit states apply only to ceilings and remaining allowance, never to usage. */
export function formatBudgetAmount(
  budget: BudgetConstraint,
  metric: (typeof BUDGET_AMOUNT_FIELDS)[keyof typeof BUDGET_AMOUNT_FIELDS],
  t: TFunction,
  compact = false,
  options: BudgetAmountFormatOptions = {},
): string {
  if (
    metric === BUDGET_AMOUNT_FIELDS.Limit ||
    metric === BUDGET_AMOUNT_FIELDS.Remaining
  ) {
    if (budget.limitState === BUDGET_LIMIT_STATES.Unlimited)
      return formatBudgetState(
        budget,
        t("keyManagement:dialog.unlimitedQuota"),
        t,
        options,
      )
    if (budget.limitState === BUDGET_LIMIT_STATES.Unconfigured)
      return formatBudgetState(
        budget,
        t("keyManagement:financial.unconfigured"),
        t,
        options,
      )
    if (
      budget.limitState === BUDGET_LIMIT_STATES.Inherited &&
      budget[metric].status !== OBSERVATION_STATUSES.Known &&
      budget[metric].status !== OBSERVATION_STATUSES.Stale
    )
      return formatBudgetState(
        budget,
        t("keyManagement:financial.inherited"),
        t,
        options,
      )
  }
  return formatBudgetObservedAmount(
    budget[metric],
    budget.asset,
    t,
    compact,
    options,
  )
}

/** Labels remain statically extractable when the same observation appears in several metrics. */
export function getBudgetMetricLabel(
  metric: (typeof BUDGET_AMOUNT_FIELDS)[
    "Limit" | "Used" | "Remaining" | "Reserved"],
  t: TFunction,
): string {
  switch (metric) {
    case BUDGET_AMOUNT_FIELDS.Limit:
      return t("keyManagement:financial.limit")
    case BUDGET_AMOUNT_FIELDS.Used:
      return t("keyManagement:financial.used")
    case BUDGET_AMOUNT_FIELDS.Remaining:
      return t("keyManagement:financial.remaining")
    case BUDGET_AMOUNT_FIELDS.Reserved:
      return t("keyManagement:financial.reserved")
  }
}

/** Shared read-only description of a budget and its reported window. */
export function formatBudgetConstraint(
  budget: BudgetConstraint,
  t: TFunction,
  includeUnknown = true,
): string {
  const knownState = isKnownOrStaleObservation(budget.stateObservation)
  const parts = (
    [
      BUDGET_AMOUNT_FIELDS.Limit,
      BUDGET_AMOUNT_FIELDS.Used,
      BUDGET_AMOUNT_FIELDS.Remaining,
      BUDGET_AMOUNT_FIELDS.Reserved,
    ] as const
  )
    .filter(
      (metric) =>
        includeUnknown ||
        budget[metric].status === OBSERVATION_STATUSES.Known ||
        budget[metric].status === OBSERVATION_STATUSES.Stale,
    )
    .map(
      (metric) =>
        `${getBudgetMetricLabel(metric, t)}: ${formatBudgetAmount(budget, metric, t)}`,
    )
  if (
    budget.limitState === BUDGET_LIMIT_STATES.Inherited &&
    (includeUnknown || knownState)
  )
    parts.unshift(
      formatBudgetState(budget, t("keyManagement:financial.inherited"), t),
    )
  if (
    !includeUnknown &&
    knownState &&
    (budget.limitState === BUDGET_LIMIT_STATES.Unlimited ||
      budget.limitState === BUDGET_LIMIT_STATES.Unconfigured)
  )
    parts.unshift(formatBudgetAmount(budget, BUDGET_AMOUNT_FIELDS.Remaining, t))
  return [...parts, ...formatBudgetRules(budget, t, includeUnknown)].join(" · ")
}

/** Window and enforcement facts, separated from amounts for aligned financial details. */
function getBudgetPeriodLabel(
  window: BudgetConstraint["window"],
  t: TFunction,
): string | undefined {
  const period =
    window.kind !== BUDGET_WINDOW_KINDS.Lifetime ? window.period : undefined
  switch (period) {
    case BUDGET_PERIODS.FiveHours:
      return t("keyManagement:financial.period.5h")
    case BUDGET_PERIODS.Day:
      return t("keyManagement:financial.period.day")
    case BUDGET_PERIODS.Week:
      return t("keyManagement:financial.period.week")
    case BUDGET_PERIODS.Month:
      return t("keyManagement:financial.period.month")
    case BUDGET_PERIODS.Year:
      return t("keyManagement:financial.period.year")
  }
}

/** Displays known budget windows and state without inferring missing reset rules. */
export function formatBudgetRules(
  budget: BudgetConstraint,
  t: TFunction,
  includeUnknown = true,
): string[] {
  const parts: string[] = []
  const window = budget.window
  const periodLabel = getBudgetPeriodLabel(window, t)
  const windowLabel =
    window.kind === BUDGET_WINDOW_KINDS.Lifetime
      ? t("keyManagement:financial.lifetime")
      : window.kind === BUDGET_WINDOW_KINDS.Unknown
        ? includeUnknown
          ? `${periodLabel ? `${periodLabel} · ` : ""}${t("keyManagement:financial.unknownWindow")}`
          : periodLabel
        : `${periodLabel}${window.kind === BUDGET_WINDOW_KINDS.Rolling ? ` (${t("keyManagement:financial.rolling")})` : ""}`
  if (windowLabel) parts.push(windowLabel)
  if (
    (window.kind === BUDGET_WINDOW_KINDS.Periodic ||
      window.kind === BUDGET_WINDOW_KINDS.Rolling) &&
    window.resetsAt !== undefined
  )
    parts.push(
      `${t("keyManagement:financial.reset")}: ${new Date(window.resetsAt).toLocaleString(undefined, { ...(window.kind === BUDGET_WINDOW_KINDS.Periodic && window.timeZone ? { timeZone: window.timeZone } : {}), timeZoneName: "short" })}`,
    )
  if (
    budget.enabled.status === OBSERVATION_STATUSES.Known &&
    !budget.enabled.value
  )
    parts.push(t("keyManagement:financial.disabled"))
  if (
    budget.enforcement !== BUDGET_ENFORCEMENT.Unknown &&
    (includeUnknown ||
      budget.stateObservation.status === OBSERVATION_STATUSES.Known ||
      budget.stateObservation.status === OBSERVATION_STATUSES.Stale)
  )
    parts.push(
      formatBudgetState(
        budget,
        budget.enforcement === BUDGET_ENFORCEMENT.Hard
          ? t("keyManagement:financial.hardLimit")
          : t("keyManagement:financial.alertOnly"),
        t,
      ),
    )
  if (budget.includesByok.status === OBSERVATION_STATUSES.Known)
    parts.push(
      budget.includesByok.value
        ? t("keyManagement:financial.includesByok")
        : t("keyManagement:financial.excludesByok"),
    )
  return parts
}
