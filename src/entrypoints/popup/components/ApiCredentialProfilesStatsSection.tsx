import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { BodySmall, Caption } from "~/components/ui"
import { useApiCredentialProfiles } from "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfiles"

import { AnimatedStatValue } from "./AnimatedStatValue"

/**
 * Popup API credential profile statistics summary for the API Credentials view.
 */
export default function ApiCredentialProfilesStatsSection() {
  const { t } = useTranslation(["apiCredentialProfiles"])
  const { profiles, isLoading } = useApiCredentialProfiles()
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
    </div>
  )
}
