import { useTranslation } from "react-i18next"

import { FormField, Input } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import type { TaskNotificationSettingsViewModel } from "~/features/BasicSettings/hooks/useTaskNotificationSettingsViewModel"
import { blurInputOnEnter } from "~/hooks/useDeferredPreferenceField"
import { TASK_NOTIFICATION_CHANNELS } from "~/types/taskNotifications"

import {
  NotificationChannelActions,
  NotificationSettingItem,
} from "./NotificationSettingItem"

/** Presents channel-specific credentials and delivery controls using the shared draft owner. */
export function NotificationTelegramChannel({
  model,
}: {
  model: TaskNotificationSettingsViewModel
}) {
  const { t } = useTranslation(["settings", "common"])
  const {
    taskNotifications,
    testingChannel,
    channels,
    telegram,
    handleTelegramChannelToggle,
    handleSendTest,
    canSendTelegramTest,
  } = model
  return (
    <>
      <NotificationSettingItem
        id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_TELEGRAM}
        title={t("taskNotifications.channels.telegram.title")}
        description={t("taskNotifications.channels.telegram.description")}
        actions={
          <NotificationChannelActions
            checked={channels[TASK_NOTIFICATION_CHANNELS.Telegram].enabled}
            disabled={!taskNotifications.enabled}
            loading={testingChannel === TASK_NOTIFICATION_CHANNELS.Telegram}
            testDisabled={!canSendTelegramTest}
            testLabel={t("taskNotifications.test.action")}
            onToggle={(enabled) => void handleTelegramChannelToggle(enabled)}
            onTest={() =>
              void handleSendTest(TASK_NOTIFICATION_CHANNELS.Telegram)
            }
          />
        }
      >
        <div className="gap-y-density-3 grid gap-x-3 sm:grid-cols-2">
          <FormField
            label={t("taskNotifications.channels.telegram.botToken")}
            htmlFor={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_TELEGRAM_BOT_TOKEN}
          >
            <Input
              id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_TELEGRAM_BOT_TOKEN}
              type="password"
              revealable
              revealLabels={{
                show: t("keyManagement:actions.showKey"),
                hide: t("keyManagement:actions.hideKey"),
              }}
              value={telegram.draft.botToken}
              disabled={
                !taskNotifications.enabled ||
                !channels[TASK_NOTIFICATION_CHANNELS.Telegram].enabled ||
                telegram.isCommitting
              }
              placeholder={t(
                "taskNotifications.channels.telegram.botTokenPlaceholder",
              )}
              onChange={(event) =>
                telegram.setDraft((draft) => ({
                  ...draft,
                  botToken: event.target.value,
                }))
              }
              onBlur={() => void telegram.commit()}
              onKeyDown={blurInputOnEnter}
            />
          </FormField>
          <FormField
            label={t("taskNotifications.channels.telegram.chatId")}
            htmlFor={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_TELEGRAM_CHAT_ID}
          >
            <Input
              id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_TELEGRAM_CHAT_ID}
              value={telegram.draft.chatId}
              disabled={
                !taskNotifications.enabled ||
                !channels[TASK_NOTIFICATION_CHANNELS.Telegram].enabled ||
                telegram.isCommitting
              }
              placeholder={t(
                "taskNotifications.channels.telegram.chatIdPlaceholder",
              )}
              onChange={(event) =>
                telegram.setDraft((draft) => ({
                  ...draft,
                  chatId: event.target.value,
                }))
              }
              onBlur={() => void telegram.commit()}
              onKeyDown={blurInputOnEnter}
            />
          </FormField>
        </div>
      </NotificationSettingItem>
    </>
  )
}
