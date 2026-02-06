import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, Input, Switch } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS,
  ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS,
  DEFAULT_ACCOUNT_AUTO_REFRESH,
} from "~/types/accountAutoRefresh"
import { showUpdateToast } from "~/utils/toastHelpers"

/**
 * Settings section for auto-refresh behavior (intervals, toggle, refresh on open).
 */
export default function RefreshSettings() {
  const { t } = useTranslation("settings")
  const {
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

  const [intervalInput, setIntervalInput] = useState(refreshInterval.toString())
  const [minIntervalInput, setMinIntervalInput] = useState(
    minRefreshInterval.toString(),
  )

  useEffect(() => {
    setIntervalInput(refreshInterval.toString())
  }, [refreshInterval])

  useEffect(() => {
    setMinIntervalInput(minRefreshInterval.toString())
  }, [minRefreshInterval])

  const handleAutoRefreshChange = async (value: boolean) => {
    const success = await updateAutoRefresh(value)
    showUpdateToast(success, t("refresh.autoRefresh"))
  }

  const handleRefreshOnOpenChange = async (value: boolean) => {
    const success = await updateRefreshOnOpen(value)
    showUpdateToast(success, t("refresh.refreshOnOpen"))
  }

  const handleRefreshIntervalBlur = async () => {
    const value = parseInt(intervalInput, 10)
    if (isNaN(value) || value < ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS) {
      toast.error(
        t("refresh.refreshIntervalInvalid", {
          minSeconds: ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS,
        }),
      )
      setIntervalInput(refreshInterval.toString())
      return
    }
    if (value === refreshInterval) return

    const success = await updateRefreshInterval(value)
    showUpdateToast(success, t("refresh.refreshInterval"))
  }

  const handleMinRefreshIntervalBlur = async () => {
    const value = parseInt(minIntervalInput, 10)
    // No upper bound: allow any integer >= MIN to let users effectively
    // reduce non-forced refresh frequency by setting a very large interval.
    if (isNaN(value) || value < ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS) {
      toast.error(
        t("refresh.minRefreshIntervalInvalid", {
          minSeconds: ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS,
        }),
      )
      setMinIntervalInput(minRefreshInterval.toString())
      return
    }
    if (value === minRefreshInterval) return

    const success = await updateMinRefreshInterval(value)
    showUpdateToast(success, t("refresh.minRefreshInterval"))
  }

  return (
    <SettingSection
      id="auto-refresh"
      title={t("refresh.title")}
      description={t("refresh.description", { defaultValue: "" })}
      onReset={resetAutoRefreshConfig}
    >
      <Card padding="none">
        <CardList>
          <CardItem
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
              title={t("refresh.refreshInterval")}
              description={t("refresh.refreshIntervalDesc", {
                defaultInterval: DEFAULT_ACCOUNT_AUTO_REFRESH.interval,
              })}
              rightContent={
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    min={ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS}
                    value={intervalInput}
                    onChange={(e) => setIntervalInput(e.target.value)}
                    onBlur={handleRefreshIntervalBlur}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        ;(e.currentTarget as HTMLInputElement).blur()
                      }
                    }}
                    placeholder={String(DEFAULT_ACCOUNT_AUTO_REFRESH.interval)}
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
            title={t("refresh.minRefreshInterval")}
            description={t("refresh.minRefreshIntervalDesc", {
              minSeconds: ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS,
            })}
            rightContent={
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  min={ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS}
                  value={minIntervalInput}
                  onChange={(e) => setMinIntervalInput(e.target.value)}
                  onBlur={handleMinRefreshIntervalBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      ;(e.currentTarget as HTMLInputElement).blur()
                    }
                  }}
                  placeholder={String(DEFAULT_ACCOUNT_AUTO_REFRESH.minInterval)}
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
