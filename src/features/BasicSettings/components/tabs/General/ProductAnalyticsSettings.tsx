import { ChartBarIcon } from "@heroicons/react/24/outline"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, Switch } from "~/components/ui"
import { trackProductAnalyticsActionStarted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  trackProductAnalyticsEvent,
} from "~/services/productAnalytics/events"
import { productAnalyticsPreferences } from "~/services/productAnalytics/preferences"
import { showUpdateToast } from "~/utils/core/toastHelpers"

/**
 * Immediate opt-out control for anonymous product analytics.
 */
export default function ProductAnalyticsSettings() {
  const { t } = useTranslation("settings")
  const [enabled, setEnabled] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const isSavingRef = useRef(false)

  useEffect(() => {
    let mounted = true

    void productAnalyticsPreferences
      .isEnabled()
      .then((nextEnabled) => {
        if (!mounted) return
        setEnabled(nextEnabled)
      })
      .catch(() => {
        if (!mounted) return
        setEnabled(false)
      })
      .finally(() => {
        if (!mounted) return
        setIsLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const handleToggle = async (nextEnabled: boolean) => {
    if (isSavingRef.current) return

    isSavingRef.current = true
    setIsSaving(true)
    const previous = enabled
    setEnabled(nextEnabled)

    try {
      const success = await productAnalyticsPreferences.setEnabled(nextEnabled)
      if (!success) {
        setEnabled(previous)
        showUpdateToast(false, t("productAnalytics.enableLabel"))
        return
      }

      showUpdateToast(true, t("productAnalytics.enableLabel"))

      if (nextEnabled) {
        void trackProductAnalyticsActionStarted({
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnalyticsSettings,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.EnableProductAnalytics,
          surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBasicSettingsGeneral,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        })
        void trackProductAnalyticsEvent(
          PRODUCT_ANALYTICS_EVENTS.SettingChanged,
          {
            setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ProductAnalyticsEnabled,
            enabled: true,
            entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
          },
        )
      }
    } catch {
      setEnabled(previous)
      showUpdateToast(false, t("productAnalytics.enableLabel"))
    } finally {
      isSavingRef.current = false
      setIsSaving(false)
    }
  }

  return (
    <SettingSection
      id="product-analytics"
      title={t("productAnalytics.title")}
      description={t("productAnalytics.description")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="product-analytics-enabled"
            icon={
              <ChartBarIcon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            }
            title={t("productAnalytics.enableLabel")}
            description={t("productAnalytics.enableDescription")}
            rightContent={
              <Switch
                checked={enabled}
                disabled={isLoading || isSaving}
                onChange={handleToggle}
              />
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
