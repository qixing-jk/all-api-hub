import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, Input, Switch } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useDeferredPreferenceField } from "~/hooks/useDeferredPreferenceField"
import {
  ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS,
  ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS,
  DEFAULT_ACCOUNT_AUTO_REFRESH,
} from "~/types/accountAutoRefresh"
import { showUpdateToast } from "~/utils/core/toastHelpers"

/**
 * Settings section for auto-refresh behavior (intervals, toggle, refresh on open).
 */
export default function RefreshSettings() {
  const { t } = useTranslation("settings")
  const {
    preferences,
    autoRefresh,
    refreshOnOpen,
    refreshInterval,
    minRefreshInterval,
    updateAutoRefresh,
    updateRefreshOnOpen,
    updateRefreshInterval,
    updateMinRefreshInterval,
    resetAutoRefreshConfig,
  } = useUserPreferencesContext()

  const handleAutoRefreshChange = async (value: boolean) => {
    const writeResult = await updateAutoRefresh(value)
    showUpdateToast(writeResult, t("refresh.autoRefresh"))
  }

  const handleRefreshOnOpenChange = async (value: boolean) => {
    const writeResult = await updateRefreshOnOpen(value)
    showUpdateToast(writeResult, t("refresh.refreshOnOpen"))
  }

  const savedVersion = preferences?.lastUpdated ?? 0
  const refreshIntervalField = useDeferredPreferenceField({
    savedValue: String(refreshInterval),
    savedVersion,
    onCommit: async (draft) => {
      const value = Number(draft)
      if (
        draft.trim() === "" ||
        !Number.isInteger(value) ||
        value < ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS
      ) {
        toast.error(
          t("refresh.refreshIntervalInvalid", {
            minSeconds: ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS,
          }),
        )
        return { ok: false }
      }

      if (value === refreshInterval) {
        return { ok: true, value: String(refreshInterval) }
      }
      const writeResult = await updateRefreshInterval(value)
      showUpdateToast(writeResult, t("refresh.refreshInterval"))
      return { ok: writeResult.ok, value: String(value) }
    },
  })
  const minRefreshIntervalField = useDeferredPreferenceField({
    savedValue: String(minRefreshInterval),
    savedVersion,
    onCommit: async (draft) => {
      const value = Number(draft)
      // No upper bound: allow any integer >= MIN to let users effectively
      // reduce non-forced refresh frequency by setting a very large interval.
      if (
        draft.trim() === "" ||
        !Number.isInteger(value) ||
        value < ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS
      ) {
        toast.error(
          t("refresh.minRefreshIntervalInvalid", {
            minSeconds: ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS,
          }),
        )
        return { ok: false }
      }

      if (value === minRefreshInterval) {
        return { ok: true, value: String(minRefreshInterval) }
      }
      const writeResult = await updateMinRefreshInterval(value)
      showUpdateToast(writeResult, t("refresh.minRefreshInterval"))
      return { ok: writeResult.ok, value: String(value) }
    },
  })

  return (
    <SettingSection
      id="auto-refresh"
      title={t("refresh.title")}
      description={t("refresh.description")}
      onReset={resetAutoRefreshConfig}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="refresh-auto-refresh-enabled"
            title={t("refresh.autoRefresh")}
            description={t("refresh.autoRefreshDesc")}
            rightContent={
              <Switch
                checked={autoRefresh}
                onChange={handleAutoRefreshChange}
              />
            }
          />

          {autoRefresh && (
            <CardItem
              id="refresh-interval"
              title={t("refresh.refreshInterval")}
              description={t("refresh.refreshIntervalDesc", {
                defaultInterval: DEFAULT_ACCOUNT_AUTO_REFRESH.interval,
              })}
              rightContent={
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    min={ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS}
                    step={1}
                    value={refreshIntervalField.draft}
                    onChange={(event) =>
                      refreshIntervalField.setDraft(event.target.value)
                    }
                    onBlur={() => void refreshIntervalField.commit()}
                    onKeyDown={refreshIntervalField.handleKeyDown}
                    placeholder={String(DEFAULT_ACCOUNT_AUTO_REFRESH.interval)}
                    aria-label={t("refresh.refreshInterval")}
                    disabled={refreshIntervalField.isCommitting}
                    className="w-24"
                  />
                  <span className="dark:text-dark-text-secondary text-sm text-gray-500">
                    {t("common:time.seconds")}
                  </span>
                </div>
              }
            />
          )}

          <CardItem
            id="refresh-on-open"
            title={t("refresh.refreshOnOpen")}
            description={t("refresh.refreshOnOpenDesc")}
            rightContent={
              <Switch
                checked={refreshOnOpen}
                onChange={handleRefreshOnOpenChange}
              />
            }
          />

          <CardItem
            id="min-refresh-interval"
            title={t("refresh.minRefreshInterval")}
            description={t("refresh.minRefreshIntervalDesc", {
              minSeconds: ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS,
            })}
            rightContent={
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  min={ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS}
                  step={1}
                  value={minRefreshIntervalField.draft}
                  onChange={(event) =>
                    minRefreshIntervalField.setDraft(event.target.value)
                  }
                  onBlur={() => void minRefreshIntervalField.commit()}
                  onKeyDown={minRefreshIntervalField.handleKeyDown}
                  placeholder={String(DEFAULT_ACCOUNT_AUTO_REFRESH.minInterval)}
                  aria-label={t("refresh.minRefreshInterval")}
                  disabled={minRefreshIntervalField.isCommitting}
                  className="w-24"
                />
                <span className="dark:text-dark-text-secondary text-sm text-gray-500">
                  {t("common:time.seconds")}
                </span>
              </div>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
