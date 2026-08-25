import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import type {
  ApiCredentialProfile,
  ApiCredentialTelemetryBalanceFact,
  ApiCredentialTelemetryQuotaWindowFact,
  ApiCredentialTelemetrySnapshot,
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
  if (balance.unit.kind === "quota") {
    const label =
      balance.unit.code === "usd-equivalent"
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
  if (balance.semantics === "cash") {
    return t("apiCredentialProfiles:telemetry.balanceSemantics.cash")
  }
  if (balance.semantics === "provider-wallet") {
    return t("apiCredentialProfiles:telemetry.balanceSemantics.providerWallet")
  }
  if (balance.semantics === "budget-equivalent") {
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
    window.type === "fiveHour"
      ? t("apiCredentialProfiles:telemetry.quotaWindows.fiveHour")
      : window.type === "weekly"
        ? t("apiCredentialProfiles:telemetry.quotaWindows.weekly")
        : window.type === "monthly"
          ? t("apiCredentialProfiles:telemetry.quotaWindows.monthly")
          : t("apiCredentialProfiles:telemetry.quotaWindows.total")
  const percent = `${Math.round(window.remainingPercent)}%`
  if (window.unit.kind === "percent" || window.remaining === undefined) {
    return `${label}: ${percent}`
  }
  const unitLabel =
    window.unit.code === "glm-credit"
      ? t("apiCredentialProfiles:telemetry.source.glmQuota")
      : window.unit.code === "usd-equivalent"
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
      <div className="space-y-3 pt-2 text-xs">
        {facts?.quota?.windows.length ? (
          <section
            data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.telemetryQuota}
          >
            <div className="dark:text-dark-text-tertiary mb-1 text-gray-500">
              {t("apiCredentialProfiles:telemetry.quota")}
            </div>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {facts.quota.windows.map((window) => (
                <div
                  className="dark:bg-dark-bg-tertiary/60 rounded-md bg-white px-2 py-1.5 font-medium text-gray-800 dark:text-gray-200"
                  key={window.type}
                >
                  <div>{formatProviderQuotaWindow(window, t)}</div>
                  {window.resetTime !== undefined ? (
                    <div className="dark:text-dark-text-tertiary mt-0.5 text-[10px] font-normal text-gray-500">
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
        <div className="grid gap-2 sm:grid-cols-4">
          <section
            data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalance}
          >
            <div className="dark:text-dark-text-tertiary mb-1 text-gray-500">
              {t("apiCredentialProfiles:telemetry.balance")}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline gap-1.5">
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
                          className="flex min-w-0 flex-wrap items-baseline gap-1.5"
                          key={`${balance.unit.kind === "money" ? balance.unit.currency : balance.unit.code}-${index}`}
                        >
                          <span className="dark:text-dark-text-primary font-semibold text-gray-900">
                            {formatProviderBalance(balance, t)}
                          </span>
                          {semanticsLabel ? (
                            <span className="dark:text-dark-text-tertiary text-[10px] text-gray-500">
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
            <div className="dark:text-dark-text-tertiary mb-1 text-gray-500">
              {t("apiCredentialProfiles:telemetry.todayUsage")}
            </div>
            <div
              className="font-semibold text-emerald-600 dark:text-emerald-400"
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
            <div className="dark:text-dark-text-tertiary mb-1 text-gray-500">
              {t("apiCredentialProfiles:telemetry.todayRequests")}
            </div>
            <div
              className="dark:text-dark-text-primary font-semibold text-gray-900"
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
            <div className="dark:text-dark-text-tertiary mb-1 text-gray-500">
              {t("apiCredentialProfiles:telemetry.models")}
            </div>
            <div
              className="dark:text-dark-text-primary truncate font-semibold text-gray-900"
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
      <div className="dark:text-dark-text-tertiary mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-2 text-xs text-gray-500">
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
              facts.usage.todayTokens.upload + facts.usage.todayTokens.download,
            )}
          </span>
        ) : null}
        {snapshot?.lastError ? (
          <span className="text-amber-600 dark:text-amber-300">
            {snapshot.lastError}
          </span>
        ) : null}
      </div>
    </>
  )
}
