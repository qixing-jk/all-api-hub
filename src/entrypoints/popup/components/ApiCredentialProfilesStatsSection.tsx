import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { BodySmall, Caption } from "~/components/ui"
import { CURRENCIES } from "~/constants/money"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { projectCredentialFinancialStats } from "~/features/ApiCredentialProfiles/allowance/credentialFinancialStats"
import { useAllowanceClock } from "~/features/ApiCredentialProfiles/allowance/useAllowanceClock"
import { useApiCredentialProfiles } from "~/features/ApiCredentialProfiles/workspace/useApiCredentialProfiles"
import { cn } from "~/lib/utils"
import { assetIdentity } from "~/services/amounts/assets"
import {
  ASSET_KINDS,
  FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { trackProductAnalyticsEvent } from "~/services/productAnalytics/runtime/dispatch"
import { formatAssetAmount, formatBalanceAmount } from "~/utils/core/money"

import { AnimatedStatValue } from "./AnimatedStatValue"

const moneyValueClassName = "block text-base font-semibold"

/**
 * Popup API credential profile statistics summary for the API Credentials view.
 */
export default function ApiCredentialProfilesStatsSection() {
  const { t, i18n } = useTranslation([
    "apiCredentialProfiles",
    "account",
    "shareSnapshots",
  ])
  const { profiles, isLoading } = useApiCredentialProfiles()
  const { currencyType: displayCurrency } = useUserPreferencesContext()
  const minute = useAllowanceClock()
  const [hasLoaded, setHasLoaded] = useState(false)

  useEffect(() => {
    if (!isLoading && !hasLoaded) {
      setHasLoaded(true)
    }
  }, [hasLoaded, isLoading])

  const isInitialLoad = !hasLoaded

  const uniqueBaseUrlsCount = useMemo(() => {
    const urls = new Set<string>()
    for (const profile of profiles) {
      if (profile.baseUrl) urls.add(profile.baseUrl)
    }
    return urls.size
  }, [profiles])

  const usedTagsCount = useMemo(() => {
    const tagIds = new Set<string>()
    for (const profile of profiles) {
      for (const id of profile.tagIds || []) {
        if (id) tagIds.add(id)
      }
    }
    return tagIds.size
  }, [profiles])

  const { telemetryStats, portfolio } = useMemo(() => {
    // The shared minute is a wake-up signal; newly received observations use the current clock.
    void minute
    return projectCredentialFinancialStats(profiles, Date.now())
  }, [profiles, minute])
  const formatAmount = (amount: Parameters<typeof formatAssetAmount>[0]) =>
    displayCurrency !== undefined &&
    amount.asset.kind === ASSET_KINDS.Currency &&
    (amount.asset.code === CURRENCIES.USD ||
      amount.asset.code === CURRENCIES.CNY) &&
    amount.asset.code !== displayCurrency
      ? formatBalanceAmount(amount, i18n.language, displayCurrency)
      : formatAssetAmount(amount, i18n.language)
  const formatUsd = (value: string) =>
    formatAmount({
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      value,
    })
  const todayUsageText =
    telemetryStats.todayUsageUsd === undefined
      ? t("apiCredentialProfiles:telemetry.notProvided")
      : formatUsd(telemetryStats.todayUsageUsd)

  useEffect(() => {
    if (isLoading) return

    void trackProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.SnapshotApiCredentialProfiles,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.PopupApiCredentialProfilesStats,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        item_count: profiles.length,
        selected_count: usedTagsCount,
        success_count: telemetryStats.healthyCount,
        failure_count: telemetryStats.unhealthyTelemetryCount,
        model_count: uniqueBaseUrlsCount,
      },
    )
  }, [
    isLoading,
    profiles.length,
    telemetryStats.healthyCount,
    telemetryStats.unhealthyTelemetryCount,
    uniqueBaseUrlsCount,
    usedTagsCount,
  ])

  if (profiles.length === 0) return null

  return (
    <div className="space-y-density-3">
      <div className="flex items-center justify-between gap-x-3 gap-y-density-3">
        <BodySmall className="font-medium">
          {t("apiCredentialProfiles:stats.totalProfiles")}
        </BodySmall>
        <AnimatedStatValue
          value={profiles.length}
          isInitialLoad={isInitialLoad}
        />
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-density-3">
        <div className="space-y-density-1">
          <Caption className="font-medium">
            {t("apiCredentialProfiles:stats.baseUrls")}
          </Caption>
          <AnimatedStatValue
            value={uniqueBaseUrlsCount}
            size="md"
            isInitialLoad={isInitialLoad}
          />
        </div>
        <div className="space-y-density-1">
          <Caption className="font-medium">
            {t("apiCredentialProfiles:stats.usedTags")}
          </Caption>
          <AnimatedStatValue
            value={usedTagsCount}
            size="md"
            isInitialLoad={isInitialLoad}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-x-3 gap-y-density-3">
        <div className="space-y-density-1">
          <Caption className="font-medium">
            {t("apiCredentialProfiles:stats.healthyProfiles")}
          </Caption>
          <AnimatedStatValue
            value={telemetryStats.healthyCount}
            size="md"
            isInitialLoad={isInitialLoad}
          />
        </div>
        <div className="space-y-density-1">
          <Caption className="font-medium">
            {t("account:financial.availableTotal")}
          </Caption>
          <span
            className={cn(
              moneyValueClassName,
              portfolio.amounts.length === 0 && "text-muted-foreground",
            )}
          >
            {portfolio.amounts.length
              ? portfolio.amounts.map((amount) => (
                  <span className="block" key={assetIdentity(amount.asset)}>
                    {formatAmount(amount)}
                  </span>
                ))
              : t("apiCredentialProfiles:telemetry.notProvided")}
          </span>
          <Caption>
            {t("apiCredentialProfiles:stats.financialCoverage", {
              included: portfolio.includedCount,
              total: portfolio.eligibleCount,
            })}{" "}
            ·{" "}
            {portfolio.coverage === FINANCIAL_COVERAGE.Complete
              ? t("shareSnapshots:financial.complete")
              : t("shareSnapshots:financial.partial")}
          </Caption>
          {portfolio.potentialDuplicateCount > 0 ? (
            <Caption className="block">
              {t("account:financial.potentialDuplicates", {
                count: portfolio.potentialDuplicateCount,
              })}
            </Caption>
          ) : null}
          {profiles.some(
            (profile) => profile.telemetrySnapshot?.facts?.balances?.length,
          ) ? (
            <Caption>
              {t("apiCredentialProfiles:telemetry.balanceSemantics.legacy")}
            </Caption>
          ) : null}
        </div>
        <div className="space-y-density-1">
          <Caption className="font-medium">
            {t("apiCredentialProfiles:stats.todayUsage")}
          </Caption>
          {telemetryStats.todayUsageUsd === undefined &&
          telemetryStats.reportedTodayCosts.length > 0 ? (
            <>
              <ul className="space-y-1">
                {telemetryStats.reportedTodayCosts.map(
                  ({ id, name, amount }) => (
                    <li key={id}>
                      <Caption className="block break-words">{name}</Caption>
                      <span
                        className={cn(
                          moneyValueClassName,
                          "text-cashflow-expense",
                        )}
                      >
                        {formatAmount(amount)}
                      </span>
                    </li>
                  ),
                )}
              </ul>
              <Caption>{t("shareSnapshots:financial.partial")}</Caption>
            </>
          ) : (
            <span
              className={cn(
                moneyValueClassName,
                telemetryStats.todayUsageUsd === undefined
                  ? "text-muted-foreground"
                  : "text-cashflow-expense",
              )}
            >
              {todayUsageText}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
