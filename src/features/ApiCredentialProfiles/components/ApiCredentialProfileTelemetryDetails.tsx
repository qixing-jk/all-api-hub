import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import type {
  ApiCredentialProfile,
  ApiCredentialTelemetryBalanceFact,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"
import { API_CREDENTIAL_TELEMETRY_FACT_UNITS } from "~/types/apiCredentialProfiles"
import { formatLocaleDateTime, formatTokenCount } from "~/utils/core/formatters"
import { formatTelemetryMoney } from "~/utils/core/money"

import { API_CREDENTIAL_PROFILES_TEST_IDS } from "../testIds"
import {
  buildAllowanceSignals,
  formatRunwayDays,
  type ApiCredentialBalanceAllowanceSignal,
} from "../utils/apiCredentialAllowance"
import {
  formatProviderBalance,
  getBalanceSemanticsLabel,
} from "../utils/apiCredentialTelemetryFormatting"
import { ApiCredentialProfileQuotaMeters } from "./ApiCredentialProfileQuotaMeters"

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

/** Explains how much of a balance is left at the currently observed spend. */
function getBalanceRunwayHint(t: TFunction, days: number): string {
  return t("apiCredentialProfiles:telemetry.allowance.runwayHint", {
    days: formatRunwayDays(days),
  })
}

/** Renders one provider balance with its semantics label when it has one. */
function ProviderBalanceValue({
  balance,
  t,
}: {
  balance: ApiCredentialTelemetryBalanceFact
  t: TFunction
}) {
  const semanticsLabel = getBalanceSemanticsLabel(balance, t)

  return (
    <div className="gap-y-density-1-5 flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      <span className="text-foreground font-semibold">
        {formatProviderBalance(balance, t)}
      </span>
      {semanticsLabel ? (
        <span className="text-muted-foreground text-3xs">{semanticsLabel}</span>
      ) : null}
    </div>
  )
}

/** Renders normalized provider facts independently from profile-row orchestration. */
export function ApiCredentialProfileTelemetryDetails({
  snapshot,
  missingTelemetryValue,
}: ApiCredentialProfileTelemetryDetailsProps) {
  const { t } = useTranslation()
  const { currencyType } = useUserPreferencesContext()
  const facts = snapshot?.facts
  const quotaWindows = facts?.quota?.windows ?? []
  const balanceRunway = buildAllowanceSignals(facts).find(
    (signal): signal is ApiCredentialBalanceAllowanceSignal =>
      signal.kind === "balance" && signal.runwayDays !== undefined,
  )

  return (
    <>
      <div className="space-y-density-3 pt-density-2 text-xs">
        {quotaWindows.length ? (
          <section
            data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.telemetryQuota}
          >
            <div className="text-muted-foreground mb-density-1">
              {t("apiCredentialProfiles:telemetry.quota")}
            </div>
            <ApiCredentialProfileQuotaMeters windows={quotaWindows} />
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
                  ? facts.balances.map((balance, index) => (
                      <ProviderBalanceValue
                        balance={balance}
                        t={t}
                        key={`${balance.unit.kind === API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Money ? balance.unit.currency : balance.unit.code}-${index}`}
                      />
                    ))
                  : missingTelemetryValue}
            </div>
            {balanceRunway?.runwayDays !== undefined &&
            balanceRunway.runwayDays > 0 ? (
              <div
                className="text-muted-foreground text-3xs mt-density-1"
                data-testid={
                  API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalanceRunway
                }
              >
                {getBalanceRunwayHint(t, balanceRunway.runwayDays)}
              </div>
            ) : null}
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
