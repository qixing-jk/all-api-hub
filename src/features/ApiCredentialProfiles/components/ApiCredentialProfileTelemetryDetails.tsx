import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import type {
  ApiCredentialProfile,
  ApiCredentialTelemetryBalanceFact,
  ApiCredentialTelemetryQuotaWindowFact,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_TELEMETRY_FACT_UNITS,
  API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES,
} from "~/types/apiCredentialProfiles"
import { formatLocaleDateTime, formatTokenCount } from "~/utils/core/formatters"
import { formatTelemetryMoney } from "~/utils/core/money"

import { API_CREDENTIAL_PROFILES_TEST_IDS } from "../testIds"

type ApiCredentialProfileTelemetryDetailsProps = {
  snapshot: ApiCredentialProfile["telemetrySnapshot"]
  missingTelemetryValue: string
}

/** Checks whether a snapshot contains metrics worth showing by default. */
export function hasApiCredentialTelemetryDetailData(
  snapshot: ApiCredentialTelemetrySnapshot | undefined,
): boolean {
  const facts = snapshot?.facts
  return Boolean(
    snapshot &&
      (facts?.balances?.length ||
        facts?.quota?.windows.length ||
        facts?.usage ||
        facts?.models ||
        Boolean(snapshot.lastError)),
  )
}

/** Formats a canonical money balance without converting its currency. */
function formatProviderBalance(
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
function getBalanceSemanticsLabel(
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

/** Formats a quota window with its absolute unit when the provider supplies it. */
function formatProviderQuotaWindow(
  window: ApiCredentialTelemetryQuotaWindowFact,
  t: TFunction,
): string {
  const label =
    window.type === API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.FiveHour
      ? t("apiCredentialProfiles:telemetry.quotaWindows.fiveHour")
      : window.type === API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.Weekly
        ? t("apiCredentialProfiles:telemetry.quotaWindows.weekly")
        : window.type === API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.Monthly
          ? t("apiCredentialProfiles:telemetry.quotaWindows.monthly")
          : t("apiCredentialProfiles:telemetry.quotaWindows.total")
  const percent = `${Math.round(window.remainingPercent)}%`
  if (
    window.unit.kind === API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Percent ||
    window.remaining === undefined
  ) {
    return `${label}: ${percent}`
  }
  const unitLabel =
    window.unit.code === API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.GlmCredit
      ? t("apiCredentialProfiles:telemetry.source.glmQuota")
      : window.unit.code ===
          API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.UsdEquivalent
        ? t("apiCredentialProfiles:telemetry.balanceSemantics.budgetEquivalent")
        : t("apiCredentialProfiles:telemetry.quota")
  return `${label}: ${window.remaining.toLocaleString()} / ${window.limit?.toLocaleString() ?? "-"} ${unitLabel} (${percent})`
}

/** Renders normalized provider facts independently from profile-row orchestration. */
export function ApiCredentialProfileTelemetryDetails({
  snapshot,
  missingTelemetryValue,
}: ApiCredentialProfileTelemetryDetailsProps) {
  const { t } = useTranslation()
  const { currencyType } = useUserPreferencesContext()
  const facts = snapshot?.facts

  return (
    <>
      <div className="space-y-density-3 pt-density-2 text-xs">
        {facts?.quota?.windows.length ? (
          <section
            data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.telemetryQuota}
          >
            <div className="text-muted-foreground mb-density-1">
              {t("apiCredentialProfiles:telemetry.quota")}
            </div>
            <div className="gap-y-density-1-5 grid gap-x-1.5 sm:grid-cols-3">
              {facts.quota.windows.map((window, index) => (
                <div
                  className="dark:bg-secondary/60 bg-card text-secondary-foreground py-density-1-5 rounded-md px-2 font-medium"
                  key={`${window.type}-${index}`}
                >
                  <div>{formatProviderQuotaWindow(window, t)}</div>
                  {window.resetTime !== undefined ? (
                    <div className="text-muted-foreground text-3xs mt-0.5 font-normal">
                      {t(
                        "apiCredentialProfiles:telemetry.quotaWindows.resetAt",
                      )}{" "}
                      {formatLocaleDateTime(
                        window.resetTime,
                        t("common:labels.notAvailable"),
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <div className="gap-y-density-2 grid gap-x-2 sm:grid-cols-4">
          <section
            data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalance}
          >
            <div className="text-muted-foreground mb-density-1">
              {t("apiCredentialProfiles:telemetry.balance")}
            </div>
            <div className="gap-y-density-1-5 flex min-w-0 flex-wrap items-baseline gap-x-1.5">
              {facts?.usage?.unlimited
                ? t("common:quota.unlimited")
                : facts?.balances?.length
                  ? facts.balances.map((balance, index) => {
                      const semanticsLabel = getBalanceSemanticsLabel(
                        balance,
                        t,
                      )
                      return (
                        <div
                          className="gap-y-density-1-5 flex min-w-0 flex-wrap items-baseline gap-x-1.5"
                          key={`${balance.unit.kind === API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Money ? balance.unit.currency : balance.unit.code}-${index}`}
                        >
                          <span className="text-foreground font-semibold">
                            {formatProviderBalance(balance, t)}
                          </span>
                          {semanticsLabel ? (
                            <span className="text-muted-foreground text-3xs">
                              {semanticsLabel}
                            </span>
                          ) : null}
                        </div>
                      )
                    })
                  : missingTelemetryValue}
            </div>
          </section>
          <section className="min-w-0">
            <div className="text-muted-foreground mb-density-1">
              {t("apiCredentialProfiles:telemetry.todayUsage")}
            </div>
            <div
              className="text-cashflow-expense font-semibold"
              data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.telemetryTodayUsage}
            >
              {facts?.usage?.todayCost !== undefined
                ? formatTelemetryMoney(
                    facts.usage.todayCost.value,
                    currencyType,
                  )
                : missingTelemetryValue}
            </div>
          </section>
          <section className="min-w-0">
            <div className="text-muted-foreground mb-density-1">
              {t("apiCredentialProfiles:telemetry.todayRequests")}
            </div>
            <div
              className="text-foreground font-semibold"
              data-testid={
                API_CREDENTIAL_PROFILES_TEST_IDS.telemetryTodayRequests
              }
            >
              {facts?.usage?.todayRequests !== undefined
                ? facts.usage.todayRequests.value.toLocaleString()
                : missingTelemetryValue}
            </div>
          </section>
          <section className="min-w-0">
            <div className="text-muted-foreground mb-density-1">
              {t("apiCredentialProfiles:telemetry.models")}
            </div>
            <div
              className="text-foreground truncate font-semibold"
              data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.telemetryModels}
              title={facts?.models?.preview.join(", ")}
            >
              {facts?.models
                ? t("apiCredentialProfiles:telemetry.modelCount", {
                    count: facts.models.count,
                  })
                : missingTelemetryValue}
            </div>
          </section>
        </div>
      </div>
      <div className="text-muted-foreground gap-y-density-1 pt-density-2 mt-auto flex flex-wrap gap-x-3 text-xs">
        <span>
          {t("apiCredentialProfiles:telemetry.lastSync")}{" "}
          {formatLocaleDateTime(
            snapshot?.lastSyncTime,
            t("common:labels.notAvailable"),
          )}
        </span>
        {facts?.usage?.todayTokens ? (
          <span>
            {t("apiCredentialProfiles:telemetry.todayTokens")}{" "}
            {formatTokenCount(
              facts.usage.todayTokens.total ??
                (facts.usage.todayTokens.upload ?? 0) +
                  (facts.usage.todayTokens.download ?? 0),
            )}
          </span>
        ) : null}
        {snapshot?.lastError ? (
          <span className="text-warning-text">{snapshot.lastError}</span>
        ) : null}
      </div>
    </>
  )
}
