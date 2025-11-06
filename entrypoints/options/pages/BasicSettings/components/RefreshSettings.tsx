import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  BodySmall,
  Card,
  CardItem,
  CardList,
  Heading4,
  Input,
  Switch
} from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"

import { showUpdateToast } from "../../../../../utils/toastHelpers.ts"

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
    updateMinRefreshInterval
  } = useUserPreferencesContext()

  const [intervalInput, setIntervalInput] = useState(refreshInterval.toString())
  const [minIntervalInput, setMinIntervalInput] = useState(
    minRefreshInterval.toString()
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
    if (isNaN(value) || value < 10) {
      toast.error(
        t("refresh.refreshInterval") + " " + t("refresh.minRefreshIntervalDesc")
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
    if (isNaN(value) || value < 0 || value > 300) {
      toast.error(
        t("refresh.minRefreshInterval") +
          " " +
          t("refresh.minRefreshIntervalDesc")
      )
      setMinIntervalInput(minRefreshInterval.toString())
      return
    }
    if (value === minRefreshInterval) return

    const success = await updateMinRefreshInterval(value)
    showUpdateToast(success, t("refresh.minRefreshInterval"))
  }

  return (
    <section>
      <Heading4 className="mb-2">{t("refresh.title")}</Heading4>
      <BodySmall className="mb-4">
        {t("refresh.description", { defaultValue: "" })}
      </BodySmall>
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
              description={t("refresh.refreshIntervalDesc")}
              rightContent={
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    min={10}
                    value={intervalInput}
                    onChange={(e) => setIntervalInput(e.target.value)}
                    onBlur={handleRefreshIntervalBlur}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        ;(e.currentTarget as HTMLInputElement).blur()
                      }
                    }}
                    placeholder="360"
                    className="w-24"
                  />
                  <span className="text-sm text-gray-500 dark:text-dark-text-secondary">
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
            description={t("refresh.minRefreshIntervalDesc")}
            rightContent={
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  min={0}
                  max={300}
                  value={minIntervalInput}
                  onChange={(e) => setMinIntervalInput(e.target.value)}
                  onBlur={handleMinRefreshIntervalBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      ;(e.currentTarget as HTMLInputElement).blur()
                    }
                  }}
                  placeholder="60"
                  className="w-24"
                />
                <span className="text-sm text-gray-500 dark:text-dark-text-secondary">
                  {t("common:time.seconds")}
                </span>
              </div>
            }
          />
        </CardList>
      </Card>
    </section>
  )
}
