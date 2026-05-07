import { BellIcon } from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import {
  Badge,
  Button,
  Card,
  CardItem,
  CardList,
  Switch,
} from "~/components/ui"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  hasPermission,
  onOptionalPermissionsChanged,
  OPTIONAL_PERMISSION_IDS,
  requestPermission,
} from "~/services/permissions/permissionManager"
import {
  TASK_NOTIFICATION_TASKS,
  type TaskNotificationTask,
} from "~/types/taskNotifications"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showResultToast, showUpdateToast } from "~/utils/core/toastHelpers"

const logger = createLogger("TaskNotificationSettings")

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
  const { t } = useTranslation("settings")
  const {
    siteAnnouncementNotifications,
    taskNotifications,
    updateSiteAnnouncementNotifications,
    updateTaskNotifications,
  } = useUserPreferencesContext()
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(
    null,
  )
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)
  const [isSendingTest, setIsSendingTest] = useState(false)

  const refreshPermissionStatus = useCallback(async () => {
    const granted = await hasPermission(OPTIONAL_PERMISSION_IDS.Notifications)
    setPermissionGranted(granted)
  }, [])

  useEffect(() => {
    void refreshPermissionStatus()
    const unsubscribe = onOptionalPermissionsChanged(() => {
      void refreshPermissionStatus()
    })
    return unsubscribe
  }, [refreshPermissionStatus])

  const handleGlobalToggle = async (enabled: boolean) => {
    const success = await updateTaskNotifications({ enabled })
    showUpdateToast(success, t("taskNotifications.enable"))
  }

  const handleTaskToggle = async (
    task: TaskNotificationTask,
    enabled: boolean,
  ) => {
    const success = await updateTaskNotifications({
      tasks: {
        ...taskNotifications.tasks,
        [task]: enabled,
      },
    })
    showUpdateToast(success, t("taskNotifications.tasksLabel"))
  }

  const handleSiteAnnouncementToggle = async (enabled: boolean) => {
    const success = await updateSiteAnnouncementNotifications({
      notificationEnabled: enabled,
    })
    showUpdateToast(success, t("taskNotifications.siteAnnouncements.enable"))
  }

  const handleRequestPermission = async () => {
    setIsRequestingPermission(true)
    try {
      const success = await requestPermission(
        OPTIONAL_PERMISSION_IDS.Notifications,
      )
      await refreshPermissionStatus()
      showResultToast(
        success,
        t("taskNotifications.permission.requestSuccess"),
        t("taskNotifications.permission.requestFailed"),
      )
    } finally {
      setIsRequestingPermission(false)
    }
  }

  const handleSendTest = async () => {
    setIsSendingTest(true)
    try {
      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.TaskNotificationsTest,
      })
      showResultToast({
        success: response?.success === true,
        message: response?.error,
        successFallback: t("taskNotifications.test.sent"),
        errorFallback: t("taskNotifications.test.failed"),
      })
    } catch (error) {
      logger.warn("Failed to send test task notification", error)
      showResultToast({
        success: false,
        message: getErrorMessage(error),
        errorFallback: t("taskNotifications.test.failed"),
      })
    } finally {
      setIsSendingTest(false)
    }
  }

  const statusText =
    permissionGranted === null
      ? t("permissions.status.checking")
      : permissionGranted
        ? t("permissions.status.granted")
        : t("permissions.status.denied")

  return (
    <SettingSection
      id="task-notifications"
      title={t("taskNotifications.title")}
      description={t("taskNotifications.description")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="task-notifications-enabled"
            icon={
              <BellIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            }
            title={t("taskNotifications.enable")}
            description={t("taskNotifications.enableDesc")}
            rightContent={
              <Switch
                checked={taskNotifications.enabled}
                onChange={handleGlobalToggle}
              />
            }
          />

          <CardItem
            id="task-notifications-permission"
            title={t("taskNotifications.permission.title")}
            description={t("taskNotifications.permission.description")}
            rightContent={
              <div className="flex flex-col gap-2 sm:items-end">
                <Badge variant={permissionGranted ? "success" : "secondary"}>
                  {statusText}
                </Badge>
                {!permissionGranted && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    loading={isRequestingPermission}
                    onClick={() => void handleRequestPermission()}
                  >
                    {t("taskNotifications.permission.request")}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={isSendingTest}
                  disabled={!permissionGranted || isSendingTest}
                  onClick={() => void handleSendTest()}
                >
                  {t("taskNotifications.test.action")}
                </Button>
              </div>
            }
          />

          {TASK_NOTIFICATION_ITEMS.map((item) => (
            <CardItem
              key={item.task}
              id={`task-notifications-${item.task}`}
              title={getTaskLabel(t, item.task)}
              description={getTaskDescription(t, item.task)}
              rightContent={
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

          <CardItem
            id="task-notifications-site-announcements"
            title={t("taskNotifications.siteAnnouncements.enable")}
            description={t("taskNotifications.siteAnnouncements.enableDesc")}
            rightContent={
              <Switch
                checked={siteAnnouncementNotifications.notificationEnabled}
                onChange={handleSiteAnnouncementToggle}
              />
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
