import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline"
import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  BodySmall,
  Button,
  Card,
  CardItem,
  CardList,
  Heading4,
  Input,
  Switch
} from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { DEFAULT_PREFERENCES } from "~/services/userPreferences"
import type { NewApiModelSyncPreferences } from "~/types/newApiModelSync"

type UserNewApiModelSyncConfig = NonNullable<
  typeof DEFAULT_PREFERENCES.newApiModelSync
>

export default function NewApiModelSyncSettings() {
  const { t } = useTranslation(["newApiModelSync", "settings"])
  const { preferences: userPrefs, updateNewApiModelSync } =
    useUserPreferencesContext()
  const [isSaving, setIsSaving] = useState(false)

  // Convert from UserPreferences.newApiModelSync to NewApiModelSyncPreferences format
  const rawPrefs = userPrefs?.newApiModelSync
  const preferences: NewApiModelSyncPreferences = rawPrefs
    ? {
        enableSync: rawPrefs.enabled,
        intervalMs: rawPrefs.interval,
        concurrency: rawPrefs.concurrency,
        maxRetries: rawPrefs.maxRetries,
        rateLimit: rawPrefs.rateLimit
      }
    : {
        enableSync: DEFAULT_PREFERENCES.newApiModelSync?.enabled ?? false,
        intervalMs:
          DEFAULT_PREFERENCES.newApiModelSync?.interval ?? 24 * 60 * 60 * 1000,
        concurrency: DEFAULT_PREFERENCES.newApiModelSync?.concurrency ?? 2,
        maxRetries: DEFAULT_PREFERENCES.newApiModelSync?.maxRetries ?? 2,
        rateLimit: DEFAULT_PREFERENCES.newApiModelSync?.rateLimit ?? {
          requestsPerMinute: 20,
          burst: 5
        }
      }

  const savePreferences = async (
    updates: Partial<NewApiModelSyncPreferences>
  ) => {
    try {
      setIsSaving(true)

      // Convert to UserPreferences.newApiModelSync format
      const userPrefsUpdate: Partial<UserNewApiModelSyncConfig> = {}
      if (updates.enableSync !== undefined) {
        userPrefsUpdate.enabled = updates.enableSync
      }
      if (updates.intervalMs !== undefined) {
        userPrefsUpdate.interval = updates.intervalMs
      }
      if (updates.concurrency !== undefined) {
        userPrefsUpdate.concurrency = updates.concurrency
      }
      if (updates.maxRetries !== undefined) {
        userPrefsUpdate.maxRetries = updates.maxRetries
      }
      if (updates.rateLimit !== undefined) {
        userPrefsUpdate.rateLimit = updates.rateLimit
      }

      const success = await updateNewApiModelSync(userPrefsUpdate)

      if (success) {
        toast.success(t("newApiModelSync:messages.success.settingsSaved"))
      } else {
        toast.error(t("settings:messages.saveSettingsFailed"))
      }
    } catch (error) {
      console.error("Failed to save preferences:", error)
      toast.error(t("settings:messages.saveSettingsFailed"))
    } finally {
      setIsSaving(false)
    }
  }

  const handleNavigateToExecution = () => {
    // Navigate to the NewApiModelSync page
    const url = browser.runtime.getURL("options.html#newApiModelSync")
    window.location.href = url
  }

  return (
    <section>
      <div className="mb-6 space-y-2">
        <Heading4>{t("newApiModelSync:settings.title")}</Heading4>
        <BodySmall>{t("newApiModelSync:description")}</BodySmall>
      </div>
      <Card padding="none">
        <CardList>
          {/* Enable Auto-Sync */}
          <CardItem
            title={t("newApiModelSync:settings.enable")}
            description={t("newApiModelSync:settings.enableDesc")}
            rightContent={
              <Switch
                checked={preferences.enableSync}
                onChange={(checked) => savePreferences({ enableSync: checked })}
                disabled={isSaving}
              />
            }
          />

          {/* Sync Interval */}
          <CardItem
            title={t("newApiModelSync:settings.interval")}
            description={t("newApiModelSync:settings.intervalDesc")}
            rightContent={
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="720"
                  value={String(preferences.intervalMs / (1000 * 60 * 60))}
                  onChange={(e) => {
                    const hours = parseFloat(e.target.value)
                    if (hours > 0) {
                      savePreferences({
                        intervalMs: hours * 60 * 60 * 1000
                      })
                    }
                  }}
                  disabled={isSaving}
                  className="w-24"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t("newApiModelSync:settings.intervalUnit")}
                </span>
              </div>
            }
          />

          {/* Concurrency */}
          <CardItem
            title={t("newApiModelSync:settings.concurrency")}
            description={t("newApiModelSync:settings.concurrencyDesc")}
            rightContent={
              <Input
                type="number"
                min="1"
                max="10"
                value={String(preferences.concurrency)}
                onChange={(e) => {
                  const concurrency = parseInt(e.target.value)
                  if (
                    Number.isFinite(concurrency) &&
                    concurrency >= 1 &&
                    concurrency <= 10
                  ) {
                    savePreferences({ concurrency })
                  }
                }}
                disabled={isSaving}
                className="w-24"
              />
            }
          />

          {/* Max Retries */}
          <CardItem
            title={t("newApiModelSync:settings.maxRetries")}
            description={t("newApiModelSync:settings.maxRetriesDesc")}
            rightContent={
              <Input
                type="number"
                min="0"
                max="5"
                value={String(preferences.maxRetries)}
                onChange={(e) => {
                  const maxRetries = parseInt(e.target.value)
                  if (
                    Number.isFinite(maxRetries) &&
                    maxRetries >= 0 &&
                    maxRetries <= 5
                  ) {
                    savePreferences({ maxRetries })
                  }
                }}
                disabled={isSaving}
                className="w-24"
              />
            }
          />

          {/* Rate Limit - Requests per Minute */}
          <CardItem
            title={t("newApiModelSync:settings.requestsPerMinute")}
            description={t("newApiModelSync:settings.requestsPerMinuteDesc")}
            rightContent={
              <Input
                type="number"
                min="5"
                max="120"
                value={String(preferences.rateLimit.requestsPerMinute)}
                onChange={(e) => {
                  const value = parseInt(e.target.value)
                  if (Number.isFinite(value) && value >= 5 && value <= 120) {
                    savePreferences({
                      rateLimit: {
                        ...preferences.rateLimit,
                        requestsPerMinute: value
                      }
                    })
                  }
                }}
                disabled={isSaving}
                className="w-24"
              />
            }
          />

          {/* Rate Limit - Burst */}
          <CardItem
            title={t("newApiModelSync:settings.burst")}
            description={t("newApiModelSync:settings.burstDesc")}
            rightContent={
              <Input
                type="number"
                min="1"
                max="20"
                value={String(preferences.rateLimit.burst)}
                onChange={(e) => {
                  const value = parseInt(e.target.value)
                  if (Number.isFinite(value) && value >= 1 && value <= 20) {
                    savePreferences({
                      rateLimit: {
                        ...preferences.rateLimit,
                        burst: value
                      }
                    })
                  }
                }}
                disabled={isSaving}
                className="w-24"
              />
            }
          />

          {/* View Execution Button */}
          <CardItem
            title={t("newApiModelSync:settings.viewExecution")}
            description={t("newApiModelSync:settings.viewExecutionDesc")}
            rightContent={
              <Button
                onClick={handleNavigateToExecution}
                variant="default"
                size="sm"
                className="flex items-center gap-2">
                <span>{t("newApiModelSync:settings.viewExecutionButton")}</span>
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </Button>
            }
          />
        </CardList>
      </Card>
    </section>
  )
}
