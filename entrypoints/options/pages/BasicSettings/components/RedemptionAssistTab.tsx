import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Switch } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"

export default function RedemptionAssistTab() {
  const { t } = useTranslation("redemptionAssist")
  const { redemptionAssist, updateRedemptionAssist, resetRedemptionAssist } =
    useUserPreferencesContext()

  const handleEnabledChange = useCallback(
    (enabled: boolean) => {
      updateRedemptionAssist({ enabled })
    },
    [updateRedemptionAssist]
  )

  const handleReset = useCallback(async () => {
    return await resetRedemptionAssist()
  }, [resetRedemptionAssist])

  const sectionAnchorId = useMemo(() => "redemption-assist", [])

  return (
    <div className="space-y-6">
      <SettingSection
        id={sectionAnchorId}
        title={t("title")}
        description={t("description")}
        onReset={handleReset}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <label
                htmlFor="redemption-assist-enabled"
                className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t("enabled")}
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("enabledDesc")}
              </p>
            </div>
            <Switch
              id="redemption-assist-enabled"
              checked={redemptionAssist.enabled}
              onChange={handleEnabledChange}
            />
          </div>
        </div>
      </SettingSection>
    </div>
  )
}
