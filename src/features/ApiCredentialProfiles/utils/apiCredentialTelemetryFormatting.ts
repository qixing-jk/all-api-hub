/**
 * Shared presentation helpers for normalized credential telemetry.
 *
 * Meters, badges, and the detail panel all describe the same facts, so the
 * wording for a balance, a quota window, and a reset countdown lives here
 * instead of being duplicated per surface.
 */

import type { TFunction } from "i18next"

import {
  API_CREDENTIAL_TELEMETRY_FACT_UNITS,
  API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES,
  type ApiCredentialTelemetryBalanceFact,
  type ApiCredentialTelemetryQuotaWindowFact,
  type ApiCredentialTelemetryQuotaWindowType,
} from "~/types/apiCredentialProfiles"

import {
  formatRunwayDays,
  getAllowanceCountdownDisplay,
  type ApiCredentialAllowanceCountdown,
  type ApiCredentialAllowanceSignal,
} from "./apiCredentialAllowance"

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
  return t("apiCredentialProfiles:telemetry.quota")
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
  return t("apiCredentialProfiles:telemetry.quotaWindows.remainingAmount", {
    remaining: window.remaining.toLocaleString(),
    limit: window.limit?.toLocaleString() ?? "-",
    unit: getQuotaWindowUnitLabel(window, t),
  })
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
    return Number.isFinite(signal.remainingPercent)
      ? t("apiCredentialProfiles:telemetry.allowance.quotaRemaining", {
          window: formatQuotaWindowLabel(t, signal.windowType),
          percent: Math.round(signal.remainingPercent),
        })
      : formatQuotaWindowLabel(t, signal.windowType)
  }

  const balanceLabel = formatProviderBalance(signal, t)
  return signal.runwayDays === undefined
    ? balanceLabel
    : t("apiCredentialProfiles:telemetry.allowance.balanceRunway", {
        balance: balanceLabel,
        days: formatRunwayDays(signal.runwayDays),
      })
}
