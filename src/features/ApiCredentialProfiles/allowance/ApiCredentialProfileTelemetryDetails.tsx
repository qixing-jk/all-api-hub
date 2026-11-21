import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import {
  buildAllowanceSignals,
  formatRunwayDays,
  type ApiCredentialBalanceAllowanceSignal,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialAllowance"
import { ApiCredentialProfileQuotaMeters } from "~/features/ApiCredentialProfiles/allowance/ApiCredentialProfileQuotaMeters"
import {
  formatProviderBalance,
  formatTelemetryAmount,
  getBalanceSemanticsLabel,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialTelemetryFormatting"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import {
  BALANCE_CASH_CLASSIFICATIONS,
  BALANCE_FUNDING,
  BALANCE_INSTRUMENTS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { selectTelemetryBalances } from "~/services/apiCredentialProfiles/telemetry/facts"
import type {
  ApiCredentialProfile,
  ApiCredentialTelemetryBalanceFact,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"
import { formatLocaleDateTime, formatTokenCount } from "~/utils/core/formatters"

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
    (selectTelemetryBalances(facts).length ||
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
function BalanceObservationNotice({
  balance,
  t,
}: {
  balance: Pick<ApiCredentialTelemetryBalanceFact, "status" | "observedAt">
  t: TFunction
}) {
  if (balance.status !== OBSERVATION_STATUSES.Stale) return null
  return (
    <span className="text-warning-text">
      <span>{t("apiCredentialProfiles:telemetry.balanceSemantics.stale")}</span>{" "}
      {balance.observedAt !== undefined ? (
        <time dateTime={new Date(balance.observedAt).toISOString()}>
          {formatLocaleDateTime(balance.observedAt)}
        </time>
      ) : null}
    </span>
  )
}

/** Renders the total and each component with their own observation state. */
function ProviderBalanceValue({
  balance,
  t,
}: {
  balance: ApiCredentialTelemetryBalanceFact
  t: TFunction
}) {
  const semanticsLabel = getBalanceSemanticsLabel(balance, t)

  return (
    <div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-density-1-5">
        <span className="font-semibold text-foreground">
          {formatProviderBalance(balance, t)}
        </span>
        {semanticsLabel ? (
          <span className="text-3xs text-muted-foreground">
            {semanticsLabel}
          </span>
        ) : null}
        <BalanceObservationNotice balance={balance} t={t} />
      </div>
      {balance.components?.length ? (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {balance.components.map((component, index) => (
            <span key={index}>
              {component.position?.instrument === BALANCE_INSTRUMENTS.Voucher
                ? t("apiCredentialProfiles:telemetry.balanceSemantics.voucher")
                : component.position?.funding === BALANCE_FUNDING.Granted
                  ? t(
                      "apiCredentialProfiles:telemetry.balanceSemantics.granted",
                    )
                  : component.position?.cashClassification ===
                      BALANCE_CASH_CLASSIFICATIONS.ReportedCash
                    ? t("apiCredentialProfiles:telemetry.balanceSemantics.cash")
                    : t(
                        "apiCredentialProfiles:telemetry.balanceSemantics.purchased",
                      )}{" "}
              {formatProviderBalance(component, t)}{" "}
              <BalanceObservationNotice balance={component} t={t} />
            </span>
          ))}
        </div>
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
            <div className="mb-density-1 text-muted-foreground">
              {t("apiCredentialProfiles:telemetry.quota")}
            </div>
            <ApiCredentialProfileQuotaMeters windows={quotaWindows} />
          </section>
        ) : null}
        <div className="grid gap-x-2 gap-y-density-2 sm:grid-cols-4">
          <section
            data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalance}
          >
            <div className="mb-density-1 text-muted-foreground">
              {t("apiCredentialProfiles:telemetry.balance")}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-density-1-5">
              {selectTelemetryBalances(facts).length
                ? selectTelemetryBalances(facts).map((balance, index) => (
                    <ProviderBalanceValue balance={balance} t={t} key={index} />
                  ))
                : facts?.usage?.unlimited
                  ? t("common:quota.unlimited")
                  : missingTelemetryValue}
            </div>
            {balanceRunway?.runwayDays !== undefined &&
            balanceRunway.runwayDays > 0 ? (
              <div
                className="mt-density-1 text-3xs text-muted-foreground"
                data-testid={
                  API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalanceRunway
                }
              >
                {getBalanceRunwayHint(t, balanceRunway.runwayDays)}
              </div>
            ) : null}
          </section>
          <section className="min-w-0">
            <div className="mb-density-1 text-muted-foreground">
              {t("apiCredentialProfiles:telemetry.todayUsage")}
            </div>
            <div
              className={
                facts?.usage?.todayCost !== undefined
                  ? "font-semibold text-cashflow-expense"
                  : "font-normal text-muted-foreground"
              }
              data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.telemetryTodayUsage}
            >
              {facts?.usage?.todayCost !== undefined
                ? formatTelemetryAmount(facts.usage.todayCost, t)
                : missingTelemetryValue}
            </div>
            {facts?.usage?.todayCost ? (
              <BalanceObservationNotice balance={facts.usage.todayCost} t={t} />
            ) : null}
          </section>
          <section className="min-w-0">
            <div className="mb-density-1 text-muted-foreground">
              {t("apiCredentialProfiles:telemetry.todayRequests")}
            </div>
            <div
              className={
                facts?.usage?.todayRequests !== undefined
                  ? "font-semibold text-foreground"
                  : "font-normal text-muted-foreground"
              }
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
            <div className="mb-density-1 text-muted-foreground">
              {t("apiCredentialProfiles:telemetry.models")}
            </div>
            <div
              className={
                facts?.models
                  ? "truncate font-semibold text-foreground"
                  : "font-normal text-muted-foreground"
              }
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
      <div className="mt-auto flex flex-wrap gap-x-3 gap-y-density-1 pt-density-2 text-xs text-muted-foreground">
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
