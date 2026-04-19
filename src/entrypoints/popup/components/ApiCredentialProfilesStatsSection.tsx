import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { BodySmall, Caption } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useApiCredentialProfiles } from "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfiles"
import { SiteHealthStatus } from "~/types"
import { formatTelemetryMoney } from "~/utils/core/money"

import { AnimatedStatValue } from "./AnimatedStatValue"

/**
 * Popup API credential profile statistics summary for the API Credentials view.
 */
export default function ApiCredentialProfilesStatsSection() {
  const { t } = useTranslation(["apiCredentialProfiles"])
  const { profiles, isLoading } = useApiCredentialProfiles()
  const { currencyType } = useUserPreferencesContext()
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

  const telemetryStats = useMemo(() => {
    const stats = profiles.reduce(
      (acc, profile) => {
        const snapshot = profile.telemetrySnapshot
        if (!snapshot) return acc
        acc.profileTelemetryCount += 1
        if (snapshot.health.status === SiteHealthStatus.Healthy) {
          acc.healthyCount += 1
        }
        if (typeof snapshot.balanceUsd === "number") {
          acc.balanceUsd += snapshot.balanceUsd
          acc.balanceSources += 1
        }
        if (typeof snapshot.todayCostUsd === "number") {
          acc.todayUsageUsd += snapshot.todayCostUsd
          acc.todayUsageSources += 1
        }
        return acc
      },
      {
        healthyCount: 0,
        balanceUsd: 0,
        balanceSources: 0,
        profileTelemetryCount: 0,
        todayUsageSources: 0,
        todayUsageUsd: 0,
      },
    )

    return {
      ...stats,
      balanceUsd: stats.balanceSources > 0 ? stats.balanceUsd : undefined,
      todayUsageUsd:
        stats.profileTelemetryCount > 0 ? stats.todayUsageUsd : undefined,
    }
  }, [profiles])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <BodySmall className="font-medium">
          {t("apiCredentialProfiles:stats.totalProfiles")}
        </BodySmall>
        <AnimatedStatValue
          value={profiles.length}
          isInitialLoad={isInitialLoad}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Caption className="font-medium">
            {t("apiCredentialProfiles:stats.baseUrls")}
          </Caption>
          <AnimatedStatValue
            value={uniqueBaseUrlsCount}
            size="md"
            isInitialLoad={isInitialLoad}
          />
        </div>
        <div className="space-y-1">
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

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Caption className="font-medium">
            {t("apiCredentialProfiles:stats.healthyProfiles")}
          </Caption>
          <AnimatedStatValue
            value={telemetryStats.healthyCount}
            size="md"
            isInitialLoad={isInitialLoad}
          />
        </div>
        <div className="space-y-1">
          <Caption className="font-medium">
            {t("apiCredentialProfiles:stats.totalBalance")}
          </Caption>
          <span className="text-base font-semibold">
            {telemetryStats.balanceUsd === undefined
              ? t("apiCredentialProfiles:telemetry.notProvided")
              : formatTelemetryMoney(telemetryStats.balanceUsd, currencyType)}
          </span>
        </div>
        <div className="space-y-1">
          <Caption className="font-medium">
            {t("apiCredentialProfiles:stats.todayUsage")}
          </Caption>
          <span className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
            {telemetryStats.todayUsageUsd === undefined ||
            telemetryStats.todayUsageSources === 0
              ? t("apiCredentialProfiles:telemetry.notProvided")
              : formatTelemetryMoney(
                  telemetryStats.todayUsageUsd,
                  currencyType,
                )}
          </span>
        </div>
      </div>
    </div>
  )
}
