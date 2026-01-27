import { BugAntIcon } from "@heroicons/react/24/outline"
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
import { showUpdateToast } from "~/utils/toastHelpers"

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
                        {t(`logging.levels.${level}`)}
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
