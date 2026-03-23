import { BugAntIcon } from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import {
  Card,
  CardItem,
  CardList,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { LOG_LEVELS, type LogLevel } from "~/types/logging"
import { showUpdateToast } from "~/utils/core/toastHelpers"

/**
 * Resolve the localized label for a supported log level.
 */
function getLogLevelLabel(t: TFunction, level: LogLevel) {
  switch (level) {
    case "debug":
      return t("settings:logging.levels.debug")
    case "info":
      return t("settings:logging.levels.info")
    case "warn":
      return t("settings:logging.levels.warn")
    case "error":
      return t("settings:logging.levels.error")
  }
}

/**
 * Settings section for unified logger preferences (console enablement + minimum level).
 */
export default function LoggingSettings() {
  const { t } = useTranslation("settings")
  const {
    loggingConsoleEnabled,
    loggingLevel,
    updateLoggingConsoleEnabled,
    updateLoggingLevel,
    resetLoggingSettings,
  } = useUserPreferencesContext()

  const handleConsoleToggle = async (enabled: boolean) => {
    const success = await updateLoggingConsoleEnabled(enabled)
    showUpdateToast(success, t("logging.consoleEnabled"))
  }

  const handleLevelChange = async (level: string) => {
    const nextLevel = level as LogLevel
    if (nextLevel === loggingLevel) return
    const success = await updateLoggingLevel(nextLevel)
    showUpdateToast(success, t("logging.minLevel"))
  }

  return (
    <SettingSection
      id="logging"
      title={t("logging.title")}
      description={t("logging.description")}
      onReset={resetLoggingSettings}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            icon={
              <BugAntIcon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            }
            title={t("logging.consoleEnabled")}
            description={t("logging.consoleEnabledDesc")}
            rightContent={
              <Switch
                checked={loggingConsoleEnabled}
                onChange={handleConsoleToggle}
              />
            }
          />

          <CardItem
            icon={
              <BugAntIcon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            }
            title={t("logging.minLevel")}
            description={t("logging.minLevelDesc")}
            rightContent={
              <div className="min-w-[180px]">
                <Select value={loggingLevel} onValueChange={handleLevelChange}>
                  <SelectTrigger disabled={!loggingConsoleEnabled}>
                    <SelectValue placeholder={t("logging.minLevel")} />
                  </SelectTrigger>
                  <SelectContent>
                    {LOG_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {getLogLevelLabel(t, level)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
