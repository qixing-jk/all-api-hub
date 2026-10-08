import { useTranslation } from "react-i18next"

import { Badge, Button } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import type { TaskNotificationSettingsViewModel } from "~/features/BasicSettings/hooks/useTaskNotificationSettingsViewModel"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import { TASK_NOTIFICATION_CHANNELS } from "~/types/taskNotifications"

import {
  NotificationChannelActions,
  NotificationSettingItem,
} from "./NotificationSettingItem"

/** Presents browser permission and delivery controls using the shared draft owner. */
export function NotificationBrowserChannel({
  model,
}: {
  model: TaskNotificationSettingsViewModel
}) {
  const { t } = useTranslation(["settings", "common"])
  const {
    taskNotifications,
    permissionGranted,
    isRequestingPermission,
    testingChannel,
    channels,
    handleBrowserChannelToggle,
    handleRequestPermission,
    handleSendTest,
    statusText,
    canSendBrowserTest,
  } = model
  return (
    <>
      <NotificationSettingItem
        id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_PERMISSION}
        title={t("taskNotifications.permission.title")}
        description={t("taskNotifications.permission.description")}
        actions={
          <div className="gap-y-density-3 flex items-center gap-x-3">
            {!permissionGranted && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-(--density-control-sm) shadow-none"
                loading={isRequestingPermission}
                data-testid={
                  BASIC_SETTINGS_TEST_IDS.taskNotificationsPermissionGrantButton
                }
                onClick={() => void handleRequestPermission()}
              >
                {isRequestingPermission
                  ? t("common:status.applying")
                  : t("taskNotifications.permission.request")}
              </Button>
            )}
            {permissionGranted !== null && (
              <>
                {!permissionGranted && (
                  <div className="bg-secondary h-4 w-px" />
                )}
                <Badge variant={permissionGranted ? "success" : "secondary"}>
                  {statusText}
                </Badge>
              </>
            )}
          </div>
        }
      />

      <NotificationSettingItem
        id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_BROWSER}
        title={t("taskNotifications.channels.browser.title")}
        description={t("taskNotifications.channels.browser.description")}
        actions={
          <NotificationChannelActions
            checked={channels[TASK_NOTIFICATION_CHANNELS.Browser].enabled}
            disabled={!taskNotifications.enabled}
            loading={testingChannel === TASK_NOTIFICATION_CHANNELS.Browser}
            testDisabled={!canSendBrowserTest}
            testLabel={t("taskNotifications.test.action")}
            testButtonTestId={
              BASIC_SETTINGS_TEST_IDS.taskNotificationsBrowserTestButton
            }
            onToggle={(enabled) => void handleBrowserChannelToggle(enabled)}
            onTest={() =>
              void handleSendTest(TASK_NOTIFICATION_CHANNELS.Browser)
            }
          />
        }
      />
    </>
  )
}
