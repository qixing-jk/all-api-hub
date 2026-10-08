import type { TFunction } from "i18next"
import { History, SlidersHorizontal, Terminal } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Button,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import LogHistoryDialog from "~/features/Logging/LogHistoryDialog"
import {
  LOG_HISTORY_LIMIT,
  LOG_HISTORY_RETENTION_MS,
} from "~/services/logging/logHistory"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { LOG_LEVELS, type LogLevel } from "~/types/logging"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"

import { LOGGING_SETTINGS_TARGET_IDS } from "./searchTargets"

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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const { t } = useTranslation("settings")
  const {
    loggingConsoleEnabled,
    loggingLevel,
    updateLoggingConsoleEnabled,
    updateLoggingLevel,
    resetLoggingSettings,
  } = useUserPreferencesContext()

  const handleConsoleToggle = async (enabled: boolean) => {
    const writeResult = await updateLoggingConsoleEnabled(enabled)
    showUpdateToast(writeResult, t("logging.consoleEnabled"))
  }

  const handleLevelChange = async (level: string) => {
    const nextLevel = level as LogLevel
    if (nextLevel === loggingLevel) return
    const writeResult = await updateLoggingLevel(nextLevel)
    showUpdateToast(writeResult, t("logging.minLevel"))
  }

  return (
    <SettingSection
      id={LOGGING_SETTINGS_TARGET_IDS.section}
      title={t("logging.title")}
      description={t("logging.description")}
      onReset={resetLoggingSettings}
      resetRequiresConfirmation={false}
      resetDisabled={
        loggingConsoleEnabled === DEFAULT_PREFERENCES.logging.consoleEnabled &&
        loggingLevel === DEFAULT_PREFERENCES.logging.level
      }
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id={LOGGING_SETTINGS_TARGET_IDS.enabled}
            icon={
              <Terminal className="text-muted-foreground dark:text-secondary-foreground h-5 w-5" />
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
            id={LOGGING_SETTINGS_TARGET_IDS.level}
            icon={
              <SlidersHorizontal className="text-muted-foreground dark:text-secondary-foreground h-5 w-5" />
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
          <CardItem
            icon={<History className="text-muted-foreground size-5" />}
            title={t("logging.history.title")}
            description={t("logging.history.entryDescription")}
            rightContent={
              <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DialogTrigger asChild>
                  <Button
                    id={LOGGING_SETTINGS_TARGET_IDS.history}
                    variant="outline"
                    size="sm"
                  >
                    {t("logging.history.open")}
                  </Button>
                </DialogTrigger>
                <DialogContent className="flex h-[min(90dvh,56rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
                  <DialogHeader className="py-density-4 shrink-0 border-b px-4 pr-12 text-left">
                    <DialogTitle>{t("logging.history.title")}</DialogTitle>
                    <DialogDescription>
                      {t("logging.history.description", {
                        hours: LOG_HISTORY_RETENTION_MS / 3600000,
                        limit: LOG_HISTORY_LIMIT,
                      })}
                    </DialogDescription>
                  </DialogHeader>
                  <LogHistoryDialog />
                </DialogContent>
              </Dialog>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
