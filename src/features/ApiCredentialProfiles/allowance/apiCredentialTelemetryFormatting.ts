/**
 * Shared presentation helpers for normalized credential telemetry.
 *
 * Meters, badges, and the detail panel all describe the same facts, so the
 * wording for a balance, a quota window, and a reset countdown lives here
 * instead of being duplicated per surface.
 */

import type { TFunction } from "i18next"

import {
  formatRunwayDays,
  getAllowanceCountdownDisplay,
  type ApiCredentialAllowanceCountdown,
  type ApiCredentialAllowanceSignal,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialAllowance"
import {
  ASSET_KINDS,
  BUDGET_LIMIT_STATES,
  EVIDENCE_KINDS,
  MEASUREMENT_UNIT_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import {
  API_CREDENTIAL_TELEMETRY_FACT_UNITS,
  API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES,
  type ApiCredentialTelemetryBalanceFact,
  type ApiCredentialTelemetryQuotaWindowFact,
  type ApiCredentialTelemetryQuotaWindowType,
} from "~/types/apiCredentialProfiles"
import { formatAssetAmount } from "~/utils/core/money"

/** Returns the localized name of a quota window slot. */
export function formatQuotaWindowLabel(
  t: TFunction,
  windowType: ApiCredentialTelemetryQuotaWindowType,
): string {
  if (windowType === API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.FiveHour) {
    return t("apiCredentialProfiles:telemetry.quotaWindows.fiveHour")
  }
  if (windowType === API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.Weekly) {
    return t("apiCredentialProfiles:telemetry.quotaWindows.weekly")
  }
  if (windowType === API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.Monthly) {
    return t("apiCredentialProfiles:telemetry.quotaWindows.monthly")
  }
  return t("apiCredentialProfiles:telemetry.quotaWindows.total")
}

/** Formats a canonical money balance without converting its currency. */
export function formatProviderBalance(
  balance: ApiCredentialTelemetryBalanceFact,
  t: TFunction,
): string {
  if (balance.budget?.limitState === BUDGET_LIMIT_STATES.Unlimited)
    return t("common:quota.unlimited")
  if (!Number.isFinite(balance.amount)) {
    const unit =
      balance.unit.kind === MEASUREMENT_UNIT_KINDS.Money
        ? balance.unit.currency
        : balance.unit.kind === ASSET_KINDS.Quota
          ? balance.unit.label
          : balance.unit.kind === ASSET_KINDS.Crypto
            ? balance.unit.id
            : ""
    return [unit, t("apiCredentialProfiles:telemetry.notProvided")]
      .filter(Boolean)
      .join(" ")
  }
  const asset = balance.position?.asset ?? balance.budget?.asset
  const observed = balance.position?.amount ?? balance.budget?.remaining
  if (
    asset &&
    asset.kind !== ASSET_KINDS.Unknown &&
    observed &&
    "value" in observed
  )
    return formatAssetAmount({ asset, value: observed.value })
  if (balance.unit.kind === MEASUREMENT_UNIT_KINDS.Unknown)
    return balance.amount.toLocaleString()
  if (balance.unit.kind === MEASUREMENT_UNIT_KINDS.Crypto)
    return formatAssetAmount({
      asset: balance.unit,
      value: String(balance.amount),
    })
  if (balance.unit.kind === API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Quota) {
    const label =
      balance.unit.code ===
      API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.UsdEquivalent
        ? t("apiCredentialProfiles:telemetry.balanceSemantics.budgetEquivalent")
        : balance.unit.label
    return `${balance.amount.toLocaleString()} ${label}`
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: balance.unit.currency,
      maximumFractionDigits: 2,
    }).format(balance.amount)
  } catch {
    return `${balance.unit.currency} ${balance.amount.toFixed(2)}`
  }
}

/** Explains whether a displayed monetary figure is spendable cash or a quota equivalent. */
export function getBalanceSemanticsLabel(
  balance: ApiCredentialTelemetryBalanceFact,
  t: TFunction,
): string | null {
  if (
    balance.position?.amount.source.kind === EVIDENCE_KINDS.Manual ||
    balance.budget?.remaining.source.kind === EVIDENCE_KINDS.Manual
  )
    return t("apiCredentialProfiles:telemetry.balanceSemantics.manual")
  if (
    balance.semantics === API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.Cash
  ) {
    return t("apiCredentialProfiles:telemetry.balanceSemantics.cash")
  }
  if (
    balance.semantics ===
    API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.ProviderWallet
  ) {
    return t("apiCredentialProfiles:telemetry.balanceSemantics.providerWallet")
  }
  if (
    balance.semantics === API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.Legacy
  )
    return t("apiCredentialProfiles:telemetry.balanceSemantics.legacy")
  if (balance.budget)
    return t("apiCredentialProfiles:telemetry.balanceSemantics.budget")
  // formatProviderBalance already appends the budget-equivalent label for
  // this unit, so a second identical suffix would render it twice.
  if (
    balance.semantics ===
      API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.BudgetEquivalent &&
    balance.unit.kind === API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Quota &&
    balance.unit.code !==
      API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.UsdEquivalent
  ) {
    return t(
      "apiCredentialProfiles:telemetry.balanceSemantics.budgetEquivalent",
    )
  }
  return null
}

/** Returns the provider's own unit name for a quota window, if it has one. */
function getQuotaWindowUnitLabel(
  window: ApiCredentialTelemetryQuotaWindowFact,
  t: TFunction,
): string {
  if (window.unit.kind !== API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Quota) {
    return t("apiCredentialProfiles:telemetry.quota")
  }
  if (
    window.unit.code === API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.GlmCredit
  ) {
    return t("apiCredentialProfiles:telemetry.source.glmQuota")
  }
  if (
    window.unit.code === API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.UsdEquivalent
  ) {
    return t(
      "apiCredentialProfiles:telemetry.balanceSemantics.budgetEquivalent",
    )
  }
  return window.unit.label &&
    window.unit.label !==
      API_CREDENTIAL_TELEMETRY_FACT_UNITS.labels.ProviderQuota
    ? window.unit.label
    : t("apiCredentialProfiles:telemetry.quota")
}

/**
 * Formats the absolute amounts behind a quota window, or `null` when the
 * provider only reports a percentage.
 */
export function formatQuotaWindowAmount(
  window: ApiCredentialTelemetryQuotaWindowFact,
  t: TFunction,
): string | null {
  if (window.remaining === undefined) return null
  return t(
    window.limit === undefined
      ? "apiCredentialProfiles:telemetry.quotaWindows.remainingOnlyAmount"
      : "apiCredentialProfiles:telemetry.quotaWindows.remainingAmount",
    {
      remaining: window.remaining.toLocaleString(),
      limit: window.limit?.toLocaleString() ?? "-",
      unit: getQuotaWindowUnitLabel(window, t),
    },
  )
}

/**
 * Renders the time left before a quota window resets.
 *
 * Uses explicit `t` calls rather than a computed key so the i18n extractor
 * keeps these strings instead of pruning them as unused.
 */ export function formatAllowanceCountdown(
  t: TFunction,
  countdown: ApiCredentialAllowanceCountdown,
): string {
  const display = getAllowanceCountdownDisplay(countdown)
  switch (display.key) {
    case "daysHours":
      return t(
        "apiCredentialProfiles:telemetry.quotaWindows.countdown.daysHours",
        display.values,
      )
    case "hoursMinutes":
      return t(
        "apiCredentialProfiles:telemetry.quotaWindows.countdown.hoursMinutes",
        display.values,
      )
    case "minutes":
      return t(
        "apiCredentialProfiles:telemetry.quotaWindows.countdown.minutes",
        display.values,
      )
    case "elapsed":
      return t("apiCredentialProfiles:telemetry.quotaWindows.countdown.elapsed")
    default:
      return t(
        "apiCredentialProfiles:telemetry.quotaWindows.countdown.imminent",
      )
  }
}

/**
 * Builds the short "what is left" label for an allowance signal.
 *
 * Quota windows and balances share one shape so a compact badge or overview
 * chip reads the same whichever kind of key is draining.
 */
export function formatAllowanceSignalLabel(
  t: TFunction,
  signal: ApiCredentialAllowanceSignal,
): string {
  if (signal.kind === "quota-window") {
    return signal.remainingPercent !== undefined &&
      Number.isFinite(signal.remainingPercent)
      ? t("apiCredentialProfiles:telemetry.allowance.quotaRemaining", {
          window: formatQuotaWindowLabel(t, signal.windowType),
          percent: Math.round(signal.remainingPercent),
        })
      : formatQuotaWindowLabel(t, signal.windowType)
  }

  const balanceLabel = formatProviderBalance(signal, t)
  if (
    signal.budget?.stateObservation?.status === OBSERVATION_STATUSES.Stale ||
    signal.budget?.remaining.status === OBSERVATION_STATUSES.Stale ||
    signal.position?.amount.status === OBSERVATION_STATUSES.Stale
  ) {
    return `${balanceLabel} (${t("apiCredentialProfiles:telemetry.balanceSemantics.stale")})`
  }
  return signal.runwayDays === undefined || signal.runwayDays <= 0
    ? balanceLabel
    : t("apiCredentialProfiles:telemetry.allowance.balanceRunway", {
        balance: balanceLabel,
        days: formatRunwayDays(signal.runwayDays),
      })
}
