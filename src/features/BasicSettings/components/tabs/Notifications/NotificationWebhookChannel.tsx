import { useTranslation } from "react-i18next"

import { FormField, Input } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import type { TaskNotificationSettingsViewModel } from "~/features/BasicSettings/hooks/useTaskNotificationSettingsViewModel"
import { blurInputOnEnter } from "~/hooks/preferences/useDeferredPreferenceField"
import { TASK_NOTIFICATION_CHANNELS } from "~/types/taskNotifications"

import {
  NotificationChannelActions,
  NotificationSettingItem,
} from "./NotificationSettingItem"

/** Presents custom webhook credentials and test controls using the shared draft owner. */
export function NotificationWebhookChannel({
  model,
}: {
  model: TaskNotificationSettingsViewModel
}) {
  const { t } = useTranslation(["settings", "common"])
  const {
    taskNotifications,
    testingChannel,
    channels,
    webhook,
    handleWebhookChannelToggle,
    handleSendTest,
    canSendWebhookTest,
  } = model
  return (
    <NotificationSettingItem
      id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_WEBHOOK}
      title={t("taskNotifications.channels.webhook.title")}
      description={t("taskNotifications.channels.webhook.description")}
      actions={
        <NotificationChannelActions
          checked={channels[TASK_NOTIFICATION_CHANNELS.Webhook].enabled}
          disabled={!taskNotifications.enabled}
          loading={testingChannel === TASK_NOTIFICATION_CHANNELS.Webhook}
          testDisabled={!canSendWebhookTest}
          testLabel={t("taskNotifications.test.action")}
          onToggle={(enabled) => void handleWebhookChannelToggle(enabled)}
          onTest={() => void handleSendTest(TASK_NOTIFICATION_CHANNELS.Webhook)}
        />
      }
    >
      <FormField
        label={t("taskNotifications.channels.webhook.url")}
        htmlFor={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_WEBHOOK_URL}
      >
        <Input
          id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_WEBHOOK_URL}
          value={webhook.draft.url}
          disabled={
            !taskNotifications.enabled ||
            !channels[TASK_NOTIFICATION_CHANNELS.Webhook].enabled ||
            webhook.isCommitting
          }
          placeholder={t("taskNotifications.channels.webhook.urlPlaceholder")}
          onChange={(event) =>
            webhook.setDraft((draft) => ({
              ...draft,
              url: event.target.value,
            }))
          }
          onBlur={() => void webhook.commit()}
          onKeyDown={blurInputOnEnter}
        />
        <p className="text-muted-foreground text-xs">
          {t("taskNotifications.channels.webhook.urlDescription")}
        </p>
      </FormField>
    </NotificationSettingItem>
  )
}
