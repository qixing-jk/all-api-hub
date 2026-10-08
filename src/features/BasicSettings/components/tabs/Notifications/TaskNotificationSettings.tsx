import type { TFunction } from "i18next"
import { Bell } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Card, CardItem, CardList, Switch } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { useTaskNotificationSettingsViewModel } from "~/features/BasicSettings/hooks/useTaskNotificationSettingsViewModel"
import {
  TASK_NOTIFICATION_TASKS,
  type TaskNotificationTask,
} from "~/types/taskNotifications"

import { NotificationBrowserChannel } from "./NotificationBrowserChannel"
import { NotificationNtfyChannel } from "./NotificationNtfyChannel"
import { NotificationSettingItem } from "./NotificationSettingItem"
import { NotificationTelegramChannel } from "./NotificationTelegramChannel"
import { NotificationWebhookChannel } from "./NotificationWebhookChannel"
import { NotificationWebhookChannels } from "./NotificationWebhookChannels"

const TASK_NOTIFICATION_ITEMS: Array<{
  task: TaskNotificationTask
}> = [
  { task: TASK_NOTIFICATION_TASKS.AutoCheckin },
  { task: TASK_NOTIFICATION_TASKS.WebdavAutoSync },
  { task: TASK_NOTIFICATION_TASKS.ManagedSiteModelSync },
  { task: TASK_NOTIFICATION_TASKS.UsageHistorySync },
  { task: TASK_NOTIFICATION_TASKS.BalanceHistoryCapture },
]

/**
 * Resolves the localized label for a task notification option.
 */
function getTaskLabel(t: TFunction<"settings">, task: TaskNotificationTask) {
  switch (task) {
    case TASK_NOTIFICATION_TASKS.AutoCheckin:
      return t("taskNotifications.tasks.autoCheckin")
    case TASK_NOTIFICATION_TASKS.WebdavAutoSync:
      return t("taskNotifications.tasks.webdavAutoSync")
    case TASK_NOTIFICATION_TASKS.ManagedSiteModelSync:
      return t("taskNotifications.tasks.managedSiteModelSync")
    case TASK_NOTIFICATION_TASKS.UsageHistorySync:
      return t("taskNotifications.tasks.usageHistorySync")
    case TASK_NOTIFICATION_TASKS.BalanceHistoryCapture:
      return t("taskNotifications.tasks.balanceHistoryCapture")
  }
}

/**
 * Resolves the localized description for a task notification option.
 */
function getTaskDescription(
  t: TFunction<"settings">,
  task: TaskNotificationTask,
) {
  switch (task) {
    case TASK_NOTIFICATION_TASKS.AutoCheckin:
      return t("taskNotifications.taskDescriptions.autoCheckin")
    case TASK_NOTIFICATION_TASKS.WebdavAutoSync:
      return t("taskNotifications.taskDescriptions.webdavAutoSync")
    case TASK_NOTIFICATION_TASKS.ManagedSiteModelSync:
      return t("taskNotifications.taskDescriptions.managedSiteModelSync")
    case TASK_NOTIFICATION_TASKS.UsageHistorySync:
      return t("taskNotifications.taskDescriptions.usageHistorySync")
    case TASK_NOTIFICATION_TASKS.BalanceHistoryCapture:
      return t("taskNotifications.taskDescriptions.balanceHistoryCapture")
  }
}

/**
 * General settings section for background scheduled-task system notifications.
 */
export default function TaskNotificationSettings() {
  const { t } = useTranslation(["settings", "common"])
  const model = useTaskNotificationSettingsViewModel()
  const {
    siteAnnouncementNotifications,
    taskNotifications,
    canResetEnablement,
    canResetChannels,
    canResetEvents,
    resetEnablement,
    resetChannels,
    resetEvents,
    handleGlobalToggle,
    handleTaskToggle,
    handleSiteAnnouncementToggle,
  } = model

  return (
    <div className="space-y-density-6">
      <SettingSection
        id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS}
        resetRequiresConfirmation={false}
        resetDisabled={!canResetEnablement}
        onReset={resetEnablement}
        title={t("taskNotifications.groups.setup.title")}
        description={t("taskNotifications.groups.setup.description")}
      >
        <Card padding="none">
          <CardList>
            <CardItem
              id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_ENABLED}
              icon={<Bell className="text-link h-5 w-5" />}
              title={t("taskNotifications.enable")}
              description={t("taskNotifications.enableDesc")}
              rightContent={
                <Switch
                  checked={taskNotifications.enabled}
                  onChange={handleGlobalToggle}
                />
              }
            />
          </CardList>
        </Card>
      </SettingSection>

      <SettingSection
        id={SETTINGS_ANCHORS.TASK_NOTIFICATION_CHANNELS}
        resetRequiresConfirmation
        resetDescription={t("messages.resetConnectionConfirmDesc")}
        resetDisabled={!canResetChannels}
        onReset={resetChannels}
        title={t("taskNotifications.groups.channels.title")}
        description={t("taskNotifications.groups.channels.description")}
      >
        <Card padding="none">
          <CardList>
            <NotificationBrowserChannel model={model} />
            <NotificationTelegramChannel model={model} />
            <NotificationWebhookChannels model={model} />
            <NotificationNtfyChannel model={model} />
            <NotificationWebhookChannel model={model} />
          </CardList>
        </Card>
      </SettingSection>

      <SettingSection
        id={SETTINGS_ANCHORS.TASK_NOTIFICATION_EVENTS}
        resetRequiresConfirmation={false}
        resetDisabled={!canResetEvents}
        onReset={resetEvents}
        title={t("taskNotifications.groups.tasks.title")}
        description={t("taskNotifications.groups.tasks.description")}
      >
        <Card padding="none">
          <CardList>
            {TASK_NOTIFICATION_ITEMS.map((item) => (
              <NotificationSettingItem
                key={item.task}
                id={`task-notifications-${item.task}`}
                title={getTaskLabel(t, item.task)}
                description={getTaskDescription(t, item.task)}
                actions={
                  <Switch
                    checked={taskNotifications.tasks[item.task]}
                    disabled={!taskNotifications.enabled}
                    onChange={(enabled) =>
                      void handleTaskToggle(item.task, enabled)
                    }
                  />
                }
              />
            ))}
            <NotificationSettingItem
              id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_SITE_ANNOUNCEMENTS}
              title={t("taskNotifications.siteAnnouncements.enable")}
              description={t("taskNotifications.siteAnnouncements.enableDesc")}
              actions={
                <Switch
                  checked={siteAnnouncementNotifications.notificationEnabled}
                  onChange={handleSiteAnnouncementToggle}
                />
              }
            />
          </CardList>
        </Card>
      </SettingSection>
    </div>
  )
}
